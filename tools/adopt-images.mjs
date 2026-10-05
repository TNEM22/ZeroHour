/**
 * node tools/adopt-images.mjs
 *
 * Takes whatever you dropped in ai_generated_images/, fits it to the exact
 * sizes each package needs, writes it into place, and reports whether the
 * backdrop is dark enough for white type to sit on.
 *
 * Headless Chrome does the resizing, so any format it can open works - png,
 * jpg, webp, avif - with no image library to install.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { decodePNG, meanLuma } from './png-read.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC = 'ai_generated_images';
const EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.webp': 'image/webp', '.avif': 'image/avif', '.html': 'text/html' };

/** base name in ai_generated_images/ -> where it has to end up, and at what size */
const PLAN = [
  { from: 'backdrop',       to: 'extension/assets/backdrop.png',          w: 1920, h: 1080 },
  { from: 'backdrop-theme', to: 'theme/images/theme_ntp_background.png',   w: 1440, h: 810,
    fallback: 'backdrop' },
  { from: 'icon', to: 'extension/assets/icon-128.png', w: 128, h: 128, alpha: true },
  { from: 'icon', to: 'extension/assets/icon-48.png',  w: 48,  h: 48,  alpha: true },
  { from: 'icon', to: 'extension/assets/icon-32.png',  w: 32,  h: 32,  alpha: true },
  { from: 'icon', to: 'extension/assets/icon-16.png',  w: 16,  h: 16,  alpha: true },
];

function find(base) {
  for (const ext of EXTS) {
    const file = join(SRC, base + ext);
    if (existsSync(file)) return file;
  }
  return null;
}

/** If the folder holds exactly one image, that is obviously the backdrop. */
function soleImage() {
  const images = readdirSync(SRC).filter((f) => EXTS.includes(extname(f).toLowerCase()));
  return images.length === 1 ? join(SRC, images[0]) : null;
}

// `node tools/adopt-images.mjs some/file.png` names the backdrop outright, so
// the file does not have to be called backdrop.png.
const EXPLICIT = process.argv[2] ? resolve(process.argv[2]) : null;
if (EXPLICIT && !existsSync(EXPLICIT)) {
  console.log('No such file: ' + EXPLICIT);
  process.exit(1);
}

const RESOLVED = {
  backdrop: EXPLICIT || find('backdrop') || soleImage(),
  'backdrop-theme': find('backdrop-theme'),
  icon: find('icon'),
};

const PAGE = (src, fit) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}
img{width:100vw;height:100vh;object-fit:${fit};object-position:center;display:block}</style>
<img src="${src}">`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(PAGE('/img?f=' + encodeURIComponent(url.searchParams.get('f')),
                          url.searchParams.get('fit')));
    }
    const file = resolve(url.searchParams.get('f'));
    if (!file.startsWith(resolve(SRC)) && file !== EXPLICIT) {
      throw new Error('outside the source folder');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});

const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));

function shoot(source, out, w, h, alpha) {
  const fit = alpha ? 'contain' : 'cover';
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--virtual-time-budget=3000'];
  if (alpha) args.push('--default-background-color=00000000');
  args.push('--screenshot=' + resolve(out),
    `http://localhost:${port}/page?f=${encodeURIComponent(source)}&fit=${fit}`);
  return new Promise((done) => spawn(CHROME, args, { stdio: 'ignore' }).on('exit', done));
}

/* ------------------------------------------------------------------ run -- */

if (!existsSync(CHROME)) {
  console.log('Chrome not found at ' + CHROME + ' - it does the resizing.');
  process.exit(1);
}

let placed = 0;
const backups = new Set();

for (const job of PLAN) {
  const source = RESOLVED[job.from] || (job.fallback ? RESOLVED[job.fallback] : null);
  if (!source) continue;

  // Keep one copy of whatever the generator made, so a bad paste is undoable.
  if (!backups.has(job.to) && existsSync(job.to)) {
    mkdirSync('tools/.previous', { recursive: true });
    copyFileSync(job.to, join('tools/.previous', job.to.replace(/[\/]/g, '_')));
    backups.add(job.to);
  }

  const code = await shoot(source, job.to, job.w, job.h, job.alpha);
  if (code !== 0) { console.log(`  FAILED  ${job.to} (chrome exited ${code})`); continue; }
  console.log(`  placed  ${job.to}  ${job.w}x${job.h}   from ${source}`);
  placed++;
}

server.close();

if (!placed) {
  console.log(`\nNothing to do. Drop backdrop.png (or .jpg/.webp) into ${SRC}/ and run this again.`);
  console.log(`See ${SRC}/PROMPTS.md for what to generate.`);
  process.exit(0);
}

/* --------------------------------------------------------- how dark is it -- */

// The band the countdown actually occupies, as fractions of the image.
const BAND = [0.18, 0.28, 0.82, 0.56];
// White type needs the graded backdrop to sit around here or below.
const WANT = 0.09;

const hero = 'extension/assets/backdrop.png';
if (existsSync(hero)) {
  const img = decodePNG(hero);
  const raw = meanLuma(img, ...BAND);

  const current = Number((await readFile('extension/css/tokens.css', 'utf8'))
    .match(/--plate-brightness:\s*([\d.]+)/)?.[1] ?? 0.68);
  const graded = raw * current;
  const suggest = Math.max(0.2, Math.min(1, WANT / Math.max(raw, 0.001)));

  console.log(`\nBehind the countdown: raw luminance ${raw.toFixed(3)}, ` +
              `${graded.toFixed(3)} after the current --plate-brightness of ${current}.`);

  if (graded <= WANT * 1.25) {
    console.log('That reads fine - white digits will hold against it.');
  } else {
    console.log(`Too bright. Set --plate-brightness to about ${suggest.toFixed(2)} ` +
                `in extension/css/tokens.css, or regenerate with a darker centre.`);
  }
  if (raw < 0.02) {
    console.log('Nearly black there - you could raise --plate-brightness and keep more of the art.');
  }
}

console.log('\nPrevious versions are in tools/.previous/ if you want them back.');
console.log('Run `node tools/verify.mjs` next, then reload the extension in chrome://extensions.');
