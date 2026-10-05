/**
 * node tools/shoot.mjs [page=newtab] [width] [height] [query]
 * Serves extension/ over localhost with the API stub injected, then has headless
 * Chrome screenshot it. Verification only; nothing here ships.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePNG } from './png.mjs';

const [page = 'newtab', width = '1600', height = '900', query = ''] = process.argv.slice(2);
const ROOT = 'extension';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };


/**
 * Stands in for Chrome's favicon service, including the behaviour that caused
 * the bug: unknown hosts get a generic globe rather than a 404, so the page
 * cannot tell "missing" from "present" by load failure alone.
 */
function discPNG(rgb) {
  const size = 32;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = Math.hypot(x - 15.5, y - 15.5) < 14;
      px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
      px[i + 3] = inside ? 255 : 0;
    }
  }
  return encodePNG(size, size, px);
}
const GENERIC_GLOBE = discPNG([150, 152, 150]);

// Stand-ins for sites Chrome does have an icon for, used to exercise the
// detection logic. Off unless the query says icons=1: a store screenshot must
// not show invented brand marks, and a fresh profile has no favicons anyway, so
// the honest default is every tile falling back to its letter.
const FAKE_ICONS = /(^|&)icons=1(&|$)/.test(query);
const HAS_ICON = {
  'www.youtube.com': discPNG([230, 33, 23]),
  'mail.google.com': discPNG([66, 133, 244]),
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (path === '/_favicon/') {
      const pageUrl = new URL(req.url, 'http://x').searchParams.get('pageUrl') || '';
      let host = '';
      try { host = new URL(pageUrl).hostname; } catch { /* unparseable */ }
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end((FAKE_ICONS && HAS_ICON[host]) || GENERIC_GLOBE);
    }
    if (path === '/__stub.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(await readFile('tools/preview/stub.js'));
    }
    const file = join(ROOT, path === '/' ? '/newtab.html' : path);
    let body = await readFile(file);
    if (extname(file) === '.html') {
      // The stub has to be in place before the page module runs.
      // Transitions do not reliably settle under --virtual-time-budget, so a
      // still shows the end state rather than whichever frame Chrome stopped on.
      const still = '<style>*,*::before,*::after{transition:none!important;'
        + 'animation:none!important}body.is-booting .hud,body.is-booting .core,'
        + 'body.is-booting .dock{opacity:1!important}</style>';
      body = body.toString().replace('</head>',
        '<script src="/__stub.js"></script>' + still + '</head>');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));
const out = join(tmpdir(), `zero-hour-shot-${page}.png`);
const url = `http://localhost:${port}/${page}.html${query ? '?' + query : ''}`;

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  `--window-size=${width},${height}`, '--virtual-time-budget=9000',
  '--screenshot=' + out, url,
], { stdio: 'ignore' });

const code = await new Promise((r) => chrome.on('exit', r));
server.close();
console.log(code === 0 ? 'shot: ' + out : 'chrome exited ' + code);
