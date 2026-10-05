/**
 * node tools/promo.mjs
 *
 * Builds the 440x280 small promo tiles the stores ask for. They must be JPEG or
 * 24-bit PNG with no alpha, so the Chrome screenshot (which is RGBA) is decoded,
 * flattened and re-encoded as colour type 2.
 *
 * Chrome does the rendering because the tile needs real typography, which the
 * procedural generator cannot draw.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { writeFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePNG24, flatten } from './png.mjs';
import { decodePNG } from './png-read.mjs';
import { PALETTES, NEUTRAL, hex } from './palette.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const W = 440;
const H = 280;

const TILES = [
  {
    key: 'theme-graphite',
    pal: NEUTRAL,
    bg: 'themes/neutral/images/theme_ntp_background.png',
    mark: 'docs/store/icon-theme-graphite-128.png',
    name: 'ZERO HOUR',
    sub: 'Graphite browser theme',
  },
  {
    key: 'extension',
    pal: PALETTES.zero,
    bg: 'extension/assets/backdrop-zero.png',
    mark: 'docs/store/icon-extension-128.png',
    name: 'ZERO HOUR',
    sub: 'New tab countdown',
  },
];

const page = (t) => `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: ${hex(t.pal.void)}; }
  .tile { position: relative; width: ${W}px; height: ${H}px; display: flex;
          align-items: center; gap: 24px; padding: 0 34px; box-sizing: border-box;
          font-family: "Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif; }
  .bg { position: absolute; inset: 0; background: url("/f?p=${encodeURIComponent(t.bg)}") center / cover no-repeat;
        filter: brightness(0.82) saturate(1.1); }
  .vig { position: absolute; inset: 0;
         background: radial-gradient(120% 95% at 50% 45%, transparent 18%, ${hex(t.pal.void)} 100%); }
  .mark { position: relative; width: 104px; height: 104px; flex: none;
          filter: drop-shadow(0 8px 24px rgba(0,0,0,.6)); }
  .text { position: relative; min-width: 0; }
  .name { font-size: 38px; line-height: 1; letter-spacing: 0.15em; color: #f6faf7;
          text-shadow: 0 0 34px rgba(0,0,0,.8); white-space: nowrap; }
  .sub { margin-top: 12px; font-size: 11.5px; letter-spacing: 0.3em; text-transform: uppercase;
         color: ${hex(t.pal.core)}; white-space: nowrap; }
</style>
<div class="tile">
  <div class="bg"></div><div class="vig"></div>
  <img class="mark" src="/f?p=${encodeURIComponent(t.mark)}" alt="">
  <div class="text"><div class="name">${t.name}</div><div class="sub">${t.sub}</div></div>
</div>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/f') {
      const file = resolve(url.searchParams.get('p'));
      if (!file.startsWith(resolve('.'))) throw new Error('outside the project');
      res.writeHead(200, { 'content-type': extname(file) === '.png' ? 'image/png' : 'application/octet-stream' });
      return res.end(await readFile(file));
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page(TILES[Number(url.searchParams.get('i'))]));
  } catch {
    res.writeHead(404).end('not found');
  }
});

const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));
const tmp = join(tmpdir(), 'zero-hour-promo-raw.png');

for (const [i, tile] of TILES.entries()) {
  await new Promise((done) => spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    // Subpixel antialiasing bakes red/blue fringes into the letters, which
    // reads as colour noise on a promo tile. Greyscale AA instead.
    '--disable-lcd-text', '--font-render-hinting=none',
    `--window-size=${W},${H}`, '--virtual-time-budget=6000',
    '--screenshot=' + tmp, `http://localhost:${port}/?i=${i}`,
  ], { stdio: 'ignore' }).on('exit', done));

  const img = decodePNG(tmp);
  if (img.width !== W || img.height !== H) {
    console.log(`  FAIL  ${tile.key}: rendered ${img.width}x${img.height}`);
    continue;
  }
  const out = `docs/store/promo-${tile.key}-440x280.png`;
  writeFileSync(out, encodePNG24(W, H, flatten(img, tile.pal.void)));
  const check = decodePNG(out);
  console.log(`  ${out}  ${check.width}x${check.height}  ${check.channels} channels  ` +
    `${(statSync(out).size / 1024).toFixed(0)} KB`);
}

server.close();
console.log('\npromo tiles written (24-bit, no alpha).');
