/**
 * node tools/test-accent-sync.mjs
 *
 * Reproduces the "Duplicate script ID" crash: turning the web accent on fires
 * storage.onChanged and permissions.onAdded at almost the same moment, so two
 * sync passes ran concurrently and both tried to register the script.
 */
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`          got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A chrome.scripting stand-in with the real uniqueness rule. */
function makeChrome({ accentWeb = true, held = true, palette = 'zero' } = {}) {
  const registered = new Map();
  const listeners = [];
  return {
    registered,
    listeners,
    api: {
      runtime: { onInstalled: { addListener: (f) => listeners.push(f) },
                 onStartup: { addListener: (f) => listeners.push(f) } },
      permissions: {
        contains: async () => { await tick(); return held; },
        onAdded: { addListener: (f) => listeners.push(f) },
        onRemoved: { addListener: (f) => listeners.push(f) },
      },
      storage: {
        sync: { get: async (d) => { await tick(); return { ...d, accentWeb, palette }; } },
        onChanged: { addListener: (f) => listeners.push(f) },
      },
      scripting: {
        getRegisteredContentScripts: async ({ ids }) => {
          await tick();
          return ids.filter((id) => registered.has(id)).map((id) => registered.get(id));
        },
        registerContentScripts: async (scripts) => {
          await tick(); // the await that opened the race window
          for (const s of scripts) {
            if (registered.has(s.id)) throw new Error(`Duplicate script ID '${s.id}'`);
            registered.set(s.id, s);
          }
        },
        unregisterContentScripts: async ({ ids }) => {
          await tick();
          for (const id of ids) {
            if (!registered.has(id)) throw new Error(`Nonexistent script ID '${id}'`);
            registered.delete(id);
          }
        },
      },
    },
  };
}

/** Load background.js fresh, with chrome stubbed, as a real ES module. */
async function loadBackground(stub, nonce) {
  const dir = mkdtempSync(join(tmpdir(), 'doom-'));
  writeFileSync(join(dir, 'defaults.mjs'), readFileSync('extension/js/defaults.js'));
  writeFileSync(join(dir, 'background.mjs'),
    readFileSync('extension/js/background.js', 'utf8').replace('./defaults.js', './defaults.mjs'));
  globalThis.chrome = stub.api;
  await import(pathToFileURL(join(dir, 'background.mjs')).href + '?v=' + nonce);
  return stub.listeners[0]; // onInstalled gets sync directly
}

let unhandled = null;
process.on('unhandledRejection', (e) => { unhandled = e; });

// The stub must actually enforce the rule, or this test proves nothing.
{
  const stub = makeChrome();
  await stub.api.scripting.registerContentScripts([{ id: 'x' }]);
  let threw = null;
  try { await stub.api.scripting.registerContentScripts([{ id: 'x' }]); }
  catch (e) { threw = e.message; }
  check('the stub reproduces the real duplicate-ID error', threw, "Duplicate script ID 'x'");
}

// The actual regression: two passes fired at once, as Chrome does.
{
  const stub = makeChrome({ accentWeb: true, held: true });
  const sync = await loadBackground(stub, 1);
  await Promise.all([sync(), sync(), sync()]);
  check('three concurrent passes register exactly once', stub.registered.size, 1);
  check('no unhandled rejection escaped', unhandled, null);
}

// Turning it back off, just as concurrently.
{
  const stub = makeChrome({ accentWeb: false, held: true });
  const sync = await loadBackground(stub, 2);
  stub.registered.set('zero-hour-web-accent', { id: 'zero-hour-web-accent' });
  await Promise.all([sync(), sync()]);
  check('concurrent passes unregister cleanly', stub.registered.size, 0);
  check('still no unhandled rejection', unhandled, null);
}

// Permission revoked from chrome://extensions while the toggle stayed on.
{
  const stub = makeChrome({ accentWeb: true, held: false });
  const sync = await loadBackground(stub, 3);
  stub.registered.set('zero-hour-web-accent', { id: 'zero-hour-web-accent' });
  await sync();
  check('revoking site access unregisters the script', stub.registered.size, 0);
}

// Nothing to do means nothing is touched.
{
  const stub = makeChrome({ accentWeb: true, held: true });
  const sync = await loadBackground(stub, 4);
  await sync();
  const after = [...stub.registered.values()][0];
  await sync();
  check('a second pass leaves the registration alone', [...stub.registered.values()][0] === after, true);
  check('the css path matches the palette', after.css, ['css/web-accent-zero.css']);
}

// Renaming the script id must not strand the registration made under the old
// one - it would keep injecting with no way to remove it.
{
  const stub = makeChrome({ accentWeb: false, held: true });
  const sync = await loadBackground(stub, 5);
  stub.registered.set('doom-web-accent', { id: 'doom-web-accent' });
  await sync();
  check('a registration under the old id is cleaned up', stub.registered.has('doom-web-accent'), false);
}

{
  const stub = makeChrome({ accentWeb: true, held: true });
  const sync = await loadBackground(stub, 6);
  stub.registered.set('doom-web-accent', { id: 'doom-web-accent' });
  await sync();
  check('old id goes, new id registers', [...stub.registered.keys()], ['zero-hour-web-accent']);
}

// Changing palette must swap the injected stylesheet, not leave the old one.
{
  const stub = makeChrome({ accentWeb: true, held: true, palette: 'ember' });
  const sync = await loadBackground(stub, 7);
  stub.registered.set('zero-hour-web-accent',
    { id: 'zero-hour-web-accent', css: ['css/web-accent-zero.css'] });
  await sync();
  check('a palette change re-registers with the new stylesheet',
    stub.registered.get('zero-hour-web-accent').css, ['css/web-accent-ember.css']);
}

await new Promise((r) => setTimeout(r, 20)); // let any stray rejection surface
check('clean at exit', unhandled, null);

console.log(failed ? `\n${failed} failing` : '\nall green');
process.exit(failed ? 1 : 0);
