/**
 * node tools/test-settings-writes.mjs
 *
 * The options page saves on every keystroke. chrome.storage.sync caps writes
 * (120/minute, 1800/hour) and replicates each one to every signed-in device, so
 * those writes have to be coalesced before they reach it.
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(nonce, { failWrites = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'zh-'));
  writeFileSync(join(dir, 'defaults.mjs'), readFileSync('extension/js/defaults.js'));
  const writes = [];
  globalThis.chrome = {
    storage: {
      sync: {
        get: async (d) => d,
        set: async (batch) => {
          writes.push(batch);
          if (failWrites) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
        },
      },
    },
  };
  const mod = await import(pathToFileURL(join(dir, 'defaults.mjs')).href + '?v=' + nonce);
  return { mod, writes };
}

// Typing a 22-character tagline used to be 22 separate synced writes.
{
  const { mod, writes } = await load(1);
  const typed = 'ALL TIMELINES CONVERGE';
  const all = [];
  for (let i = 1; i <= typed.length; i++) all.push(mod.saveSettings({ tagline: typed.slice(0, i) }));
  await Promise.all(all);
  check('22 keystrokes become one write', writes.length, 1);
  check('the write holds the final value', writes[0], { tagline: typed });
}

// Separate fields edited in the same burst must all survive the merge.
{
  const { mod, writes } = await load(2);
  const done = [mod.saveSettings({ title: 'A' }), mod.saveSettings({ tagline: 'B' }),
                mod.saveSettings({ title: 'AB' })];
  await Promise.all(done);
  check('fields merge, last value wins', writes[0], { title: 'AB', tagline: 'B' });
}

// Closing the tab mid-pause must not drop the edit.
{
  const { mod, writes } = await load(3);
  mod.saveSettings({ title: 'typed then closed' });
  check('nothing written yet', writes.length, 0);
  await mod.flushSettings();
  check('flush writes immediately', writes, [{ title: 'typed then closed' }]);
}

// A refused write must reach the caller, not be swallowed into a false "Saved".
{
  const { mod } = await load(4, { failWrites: true });
  let message = null;
  await mod.saveSettings({ title: 'x' }).catch((e) => { message = e.message; });
  check('a quota failure rejects the caller', message, 'QUOTA_BYTES_PER_ITEM quota exceeded');
}

// A later edit must not be stranded by an earlier failure.
{
  const { mod, writes } = await load(5);
  await mod.saveSettings({ a: 1 });
  await wait(10);
  await mod.saveSettings({ b: 2 });
  check('consecutive bursts write separately', writes, [{ a: 1 }, { b: 2 }]);
}

console.log(failed ? `\n${failed} failing` : '\nall green');
process.exit(failed ? 1 : 0);
