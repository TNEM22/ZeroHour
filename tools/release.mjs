/**
 * node tools/release.mjs
 *
 * Gathers everything two store submissions need into release/v<version>/,
 * numbered in the order they should be sent: the theme first, because it has no
 * code and no permissions, and because its published URL is what the extension
 * then links to. Refuses to assemble anything if a check fails.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const run = (script) => {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  const ok = r.status === 0;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${script}`);
  if (!ok) console.log(r.stdout + r.stderr);
  return ok;
};

console.log('checks:');
const passed = ['tools/verify.mjs', 'tools/test-countdown.mjs', 'tools/test-accent-sync.mjs',
  'tools/test-settings-writes.mjs'].map(run).every(Boolean);
if (!passed) {
  console.log('\nnot releasing: fix the failures above first.');
  process.exit(1);
}

if (spawnSync(process.execPath, ['tools/build.mjs'], { stdio: 'ignore' }).status !== 0) {
  console.log('\nnot releasing: the build failed.');
  process.exit(1);
}

const ext = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const theme = JSON.parse(readFileSync('themes/neutral/manifest.json', 'utf8'));

const dir = join('release', 'v' + ext.version);
const themeDir = join(dir, '1-theme');
const extDir = join(dir, '2-extension');
const shots = join(extDir, 'screenshots');
mkdirSync(shots, { recursive: true });
mkdirSync(themeDir, { recursive: true });

const themePkg = `zero-hour-theme-graphite-${theme.version}.zip`;
copyFileSync('dist/zero-hour-theme-neutral.zip', join(themeDir, themePkg));
copyFileSync('docs/store/LISTING-THEME.md', join(themeDir, 'LISTING.md'));
// The portal asks for a 128x128 store icon. A theme package has no icons key,
// so this is a listing asset only - it never goes inside the zip.
copyFileSync('docs/store/icon-theme-graphite-128.png', join(themeDir, 'store-icon-128.png'));
copyFileSync('docs/store/promo-theme-graphite-440x280.png', join(themeDir, 'promo-tile-440x280.png'));

const extPkg = `zero-hour-extension-${ext.version}.zip`;
copyFileSync('dist/zero-hour-extension.zip', join(extDir, extPkg));
copyFileSync('docs/store/LISTING.md', join(extDir, 'LISTING.md'));
copyFileSync('docs/store/icon-extension-128.png', join(extDir, 'store-icon-128.png'));
copyFileSync('docs/store/promo-extension-440x280.png', join(extDir, 'promo-tile-440x280.png'));
for (const f of readdirSync('docs/store')
  .filter((f) => f.endsWith('.png') && !/^(icon|promo)-/.test(f))) {
  copyFileSync(join('docs/store', f), join(shots, f));
}

const linked = /THEME_URLS = \{[^}]*?(chrome|edge|default):\s*'https?:/s
  .test(readFileSync('extension/js/defaults.js', 'utf8'));

const checklist = `# Submitting Zero Hour

Two items, in this order. The folders are numbered because the order matters:
the theme's published URL is what the extension links to, so sending the
extension first would mean resubmitting it later just to add a link.

---

# 1. The theme — \`1-theme/\`

Upload \`${themePkg}\`. Copy is in \`1-theme/LISTING.md\`.

- [ ] Create the submission and upload the zip
- [ ] Paste the name, short description and detailed description
- [ ] **Take the screenshots yourself.** A theme screenshot has to show real
      browser chrome, which does not exist in a headless render — \`LISTING.md\`
      has step-by-step instructions. It takes a minute
- [ ] Privacy: nothing collected, nothing transmitted, no remote code, no
      permissions. A theme manifest has no \`permissions\` key at all
- [ ] Submit, and wait for it to go live

## Then, before moving on

- [ ] Copy the published listing URL into \`THEME_URLS\` in
      \`extension/js/defaults.js\` — \`chrome\` and/or \`edge\`
- [ ] Re-run \`node tools/release.mjs\` so the extension package picks it up

${linked
  ? '  Status: a theme URL is already configured. The link will work.'
  : '  Status: NO theme URL is configured yet. The extension will ship with the\n' +
    '  link hidden and a note saying the listing is not live. That is a valid\n' +
    '  release, but it is not the plan you chose — fill it in first.'}

---

# 2. The extension — \`2-extension/\`

Upload \`${extPkg}\`. Copy is in \`2-extension/LISTING.md\`, screenshots in
\`2-extension/screenshots/\` (1280x800, already the right size).

- [ ] Upload the zip and paste the listing copy
- [ ] Add the three screenshots, \`01\` first
- [ ] Chrome also wants a **single purpose** statement — it is in \`LISTING.md\`
- [ ] Justify every permission from the table in \`LISTING.md\`. Do not
      paraphrase loosely; vague justifications are the usual reason for a bounce
- [ ] Privacy declarations: no data collected, nothing transmitted
- [ ] Submit

---

## Known review-friction item

The optional "accent on web pages" feature is the only part asking for broad
host access. It is opt-in, requested only when the user enables it, revoked when
they turn it off, and applies one static stylesheet with no scripting — all
defensible. If a reviewer pushes back on single purpose, \`2-extension/LISTING.md\`
has the removal steps: six files, nothing else depends on it.

## If you resubmit

Bump \`version\` — \`extension/manifest.json\` for the extension, \`THEME_VERSION\`
in \`tools/gen-assets.mjs\` for the themes. Both stores reject a reused version
number, and it is the most common way a second attempt fails.

## Not being submitted

\`themes/zero\`, \`themes/ember\` and \`themes/astra\` match the extension's
palettes exactly, but the frame is near-black in all three and the difference is
a few points of hue. One graphite theme covers them. They stay in the repo for
anyone who wants to load one unpacked.
`;

writeFileSync(join(dir, 'SUBMIT.md'), checklist);

const kb = (p) => (statSync(p).size / 1024).toFixed(0) + ' KB';
console.log(`\n${dir}/`);
console.log('  SUBMIT.md');
console.log(`  1-theme/${themePkg}  ${kb(join(themeDir, themePkg))}`);
console.log('  1-theme/LISTING.md');
  console.log('  1-theme/store-icon-128.png');
  console.log('  1-theme/promo-tile-440x280.png');
console.log(`  2-extension/${extPkg}  ${kb(join(extDir, extPkg))}`);
console.log('  2-extension/LISTING.md');
  console.log('  2-extension/store-icon-128.png');
  console.log('  2-extension/promo-tile-440x280.png');
console.log(`  2-extension/screenshots/  ${readdirSync(shots).length} files`);
console.log(linked
  ? '\nready: theme URL is configured.'
  : '\nready — but no theme URL is configured yet. Publish the theme first,\nthen put its URL in THEME_URLS and re-run this.');
