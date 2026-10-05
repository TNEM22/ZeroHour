/**
 * node tools/verify.mjs
 * Static checks for the two packages: every referenced file exists, the icons
 * really are the size they claim, and nothing trips Chrome's extension CSP.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

let problems = 0;
const fail = (msg) => { problems++; console.log('  FAIL  ' + msg); };
const ok = (msg) => console.log('  ok    ' + msg);

const read = (f) => readFileSync(f, 'utf8');

/** Width/height straight out of the PNG header. */
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function checkRef(from, ref, label) {
  if (/^(https?:|data:|chrome-extension:|#|mailto:)/i.test(ref)) return;
  const target = resolve(dirname(from), ref.split(/[?#]/)[0]);
  if (existsSync(target)) return;
  fail(`${label}: ${relative('.', from)} points at "${ref}", which does not exist`);
}

/* ------------------------------------------------------------ manifests -- */

const THEME_DIRS = readdirSync('themes')
  .filter((d) => statSync(join('themes', d)).isDirectory())
  .map((d) => 'themes/' + d);

for (const dir of [...THEME_DIRS, 'extension']) {
  const file = join(dir, 'manifest.json');
  let m;
  try { m = JSON.parse(read(file)); } catch (e) { fail(`${file}: ${e.message}`); continue; }
  if (m.manifest_version !== 3) fail(`${file}: manifest_version should be 3`);
  if (!m.name || !m.version) fail(`${file}: needs a name and a version`);
  ok(`${file} parses (${m.name} ${m.version})`);

  const refs = [];
  if (m.theme) refs.push(...Object.values(m.theme.images || {}));
  if (m.icons) refs.push(...Object.values(m.icons));
  if (m.action?.default_icon) refs.push(...Object.values(m.action.default_icon));
  if (m.action?.default_popup) refs.push(m.action.default_popup);
  if (m.options_ui?.page) refs.push(m.options_ui.page);
  if (m.background?.service_worker) refs.push(m.background.service_worker);
  if (m.chrome_url_overrides) refs.push(...Object.values(m.chrome_url_overrides));
  for (const ref of refs) checkRef(join(dir, 'manifest.json'), './' + ref, 'manifest');

  // Icon files must actually be the size the key claims.
  for (const [size, path] of Object.entries(m.icons || {})) {
    const f = join(dir, path);
    if (!existsSync(f)) continue;
    const { w, h } = pngSize(f);
    if (w !== +size || h !== +size) fail(`${path} is ${w}x${h} but declared as ${size}`);
  }
}

/* ------------------------------------------------------- html, css, csp -- */

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk('extension');

for (const file of files.filter((f) => f.endsWith('.html'))) {
  const html = read(file);
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) checkRef(file, ref, 'html');

  // Chrome's default extension CSP rejects all of these.
  if (/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html)) fail(`${file}: inline <script>`);
  if (/<style[^>]*>/.test(html)) fail(`${file}: inline <style>`);
  const onAttr = html.match(/\son[a-z]+\s*=/i);
  if (onAttr) fail(`${file}: inline handler ${onAttr[0].trim()}`);
  ok(`${file} refs resolve, no inline script or style`);
}

for (const file of files.filter((f) => f.endsWith('.css'))) {
  for (const [, ref] of read(file).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) checkRef(file, ref, 'css');
  ok(`${file} url() refs resolve`);
}

/* ----------------------------------------------------------- permissions -- */

const manifest = JSON.parse(read('extension/manifest.json'));
const declared = new Set([...(manifest.permissions || []), ...(manifest.optional_permissions || [])]);
const NEEDS = { 'chrome.topSites': 'topSites', 'chrome.storage': 'storage',
                'chrome.search': 'search', 'chrome.scripting': 'scripting' };
const code = files.filter((f) => f.endsWith('.js')).map(read).join('\n');
for (const [api, perm] of Object.entries(NEEDS)) {
  if (code.includes(api) && !declared.has(perm)) fail(`code calls ${api} but "${perm}" is not in the manifest`);
}
if (code.includes('/_favicon/') && !declared.has('favicon')) fail('code builds favicon URLs but "favicon" is not declared');
ok('every chrome API used is covered by a declared permission');

/* ------------------------------------------------------------- branding -- */

// The whole point of the artwork being procedural: make sure no trademarked
// name has crept into anything that ships.
// Chrome drops a compiled cache into a theme folder it has loaded unpacked.
// It is large and holds whatever the theme looked like then, so it must not ship.
const JUNK = ['Cached Theme.pak', 'Thumbs.db', '.DS_Store'];
let junk = 0;
for (const file of files.concat(...THEME_DIRS.map(walk))) {
  if (JUNK.includes(file.split(/[/\\]/).pop())) {
    junk++;
    fail(`${file} is generated and must not ship - delete it`);
  }
}
if (!junk) ok('no generated or editor junk inside the packages');

/* ------------------------------------------------- nothing personal ships -- */

// A published package is readable by anyone who installs it. These are the
// things that leak by accident: an address in a comment, a machine path baked
// into a generated file, a stray local URL left over from development.
const SHIPPED_TEXT = files.filter((f) => /[.](html|css|js|json)$/.test(f));
const LEAKS = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}/, 'an email address'],
  // Requires a backslash, so https:// does not match.
  [/[A-Za-z]:[\\]/, 'an absolute Windows path'],
  [/\/(Users|home)\/[A-Za-z0-9._-]+\//, 'an absolute home-directory path'],
  [/https?:\/\/(localhost|127[.]0[.]0[.]1)/, 'a local development URL'],
];

let leaks = 0;
for (const file of SHIPPED_TEXT) {
  const text = read(file);
  for (const [pattern, what] of LEAKS) {
    const hit = text.match(pattern);
    if (hit) { leaks++; fail(`${file} contains ${what}: ${hit[0]}`); }
  }
}
if (!leaks) ok('no emails, machine paths or local URLs in the package');

/* --------------------------------------------------- nothing unused ships -- */

// An asset nobody references is either dead weight or something that was never
// meant to be in here.
const SOURCE = SHIPPED_TEXT.map(read).join('\n');
let orphans = 0;
for (const file of files) {
  if (/[.](html|css|js|json)$/.test(file)) continue;
  const base = file.split(/[\\/]/).pop();
  if (SOURCE.includes(base)) continue;
  // Built at runtime, e.g. `assets/sigil-${palette}.png` -> look for "sigil-".
  const stem = base.replace(/-[^-]*[.][a-z0-9]+$/i, '-');
  if (stem !== base && SOURCE.includes(stem)) continue;
  orphans++;
  fail(`${file} is in the package but nothing references it`);
}
if (!orphans) ok('every shipped file is referenced');

const BANNED = /\b(marvel|avengers|disney|mcu)\b/i;
for (const file of files.concat(...THEME_DIRS.map(walk))) {
  if (!/\.(html|css|js|json)$/.test(file)) continue;
  const hit = read(file).match(BANNED);
  if (hit) fail(`${file} mentions "${hit[0]}" in a file that ships`);
}
ok('no studio or franchise names in the shipped packages');

console.log(problems ? `\n${problems} problem(s)` : '\nverified clean');
process.exit(problems ? 1 : 0);
