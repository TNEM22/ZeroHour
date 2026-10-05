/**
 * node tools/test-countdown.mjs
 * The extension ships plain ES modules, so load the source through a data: URL
 * rather than littering the package with a package.json just for tests.
 */
import { readFileSync } from 'node:fs';

const src = readFileSync('extension/js/countdown.js', 'utf8');
const { breakdown, addMonths, MS } =
  await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? '  pass  ' : '  FAIL  ') + name);
  if (!ok) console.log('          got  ' + JSON.stringify(got) + '\n          want ' + JSON.stringify(want));
}
const five = (b) => [b.months, b.days, b.hours, b.minutes, b.seconds];
const L = (s) => new Date(s); // parsed as local time

// The teaser in the reference screenshot read 04:27:15:59:56 toward 18 Dec 2026.
check('reproduces the teaser reading',
  five(breakdown(L('2026-07-20T08:00:04'), L('2026-12-18T00:00:00'))),
  [4, 27, 15, 59, 56]);

check('today to release', five(breakdown(L('2026-10-02T00:00:00'), L('2026-12-18T00:00:00'))),
  [2, 16, 0, 0, 0]);

// Day-of-month clamping: 31 Jan + 1 month must land on 28 Feb, not 3 Mar.
check('clamps short months', five(breakdown(L('2026-01-31T00:00:00'), L('2026-03-01T00:00:00'))),
  [1, 1, 0, 0, 0]);
check('exact clamped month', five(breakdown(L('2026-01-31T00:00:00'), L('2026-02-28T00:00:00'))),
  [1, 0, 0, 0, 0]);
check('leap day', five(breakdown(L('2028-01-31T00:00:00'), L('2028-02-29T00:00:00'))),
  [1, 0, 0, 0, 0]);

check('one second out', five(breakdown(L('2026-12-17T23:59:59'), L('2026-12-18T00:00:00'))),
  [0, 0, 0, 0, 1]);
check('past target is arrived', breakdown(L('2027-01-01T00:00:00'), L('2026-12-18T00:00:00')).arrived, true);
check('exactly at target is arrived', breakdown(L('2026-12-18T00:00:00'), L('2026-12-18T00:00:00')).arrived, true);

// Invariant: now + months + days + hours + minutes + seconds must land exactly
// on the target, for any pair. This is the property that matters.
let bad = 0;
for (let i = 0; i < 4000; i++) {
  const now = new Date(2024, 0, 1 + ((Math.random() * 2000) | 0), (Math.random() * 24) | 0,
                       (Math.random() * 60) | 0, (Math.random() * 60) | 0);
  const target = new Date(now.getTime() + Math.floor(Math.random() * 3600 * 24 * 900) * 1000);
  const b = breakdown(now, target);
  const rebuilt = addMonths(now, b.months).getTime() +
    b.days * MS.day + b.hours * MS.hour + b.minutes * MS.minute + b.seconds * MS.second;
  if (rebuilt !== target.getTime()) {
    if (bad++ === 0) console.log('          first mismatch:', now.toString(), '->', target.toString(), JSON.stringify(b));
  }
}
check('4000 random pairs reconstruct exactly', bad, 0);

console.log(failed ? '\n' + failed + ' failing' : '\nall green');
process.exit(failed ? 1 : 0);
