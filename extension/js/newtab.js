import { loadSettings, DEFAULTS } from './defaults.js';
import { breakdown, pad2, UNITS } from './countdown.js';

const $ = (id) => document.getElementById(id);
const el = { title: $('title'), clock: $('clock'), date: $('date'), clockWrap: $('clockWrap'),
             eyebrow: $('eyebrow'), counter: $('counter'), sr: $('srCountdown'),
             tagline: $('tagline'), search: $('search'), q: $('q'),
             tiles: $('tiles'), enableTiles: $('enableTiles'),
             timeline: $('timeline'), progress: $('progress'),
             sigil: document.querySelector('.hud__sigil') };

// The run-up the progress bar measures. A fixed window means the bar reads the
// same on any target date, with no stored "when you started" to drift.
const RUNWAY = 365 * 24 * 60 * 60 * 1000;

let settings = { ...DEFAULTS };
let target = new Date(DEFAULTS.target);
let timer = null;
const cells = new Map(); // unit name -> { value, wrap, shown }

/* -------------------------------------------------------------- counter -- */

function buildCounter() {
  el.counter.textContent = '';
  cells.clear();
  UNITS.forEach((unit, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'counter__sep';
      sep.textContent = ':';
      el.counter.append(sep);
    }
    const wrap = document.createElement('div');
    wrap.className = 'unit';
    const value = document.createElement('span');
    value.className = 'unit__value';
    value.textContent = '00';
    const label = document.createElement('span');
    label.className = 'unit__label';
    label.textContent = unit;
    wrap.append(value, label);
    el.counter.append(wrap);
    cells.set(unit, { value, wrap, shown: null });
  });
}

function paint() {
  const b = breakdown(new Date(), target);
  for (const unit of UNITS) {
    const cell = cells.get(unit);
    const next = pad2(b[unit]);
    if (cell.shown === next) continue;
    cell.shown = next;
    cell.value.textContent = next;
    if (unit === 'seconds' && settings.motion) {
      cell.wrap.classList.remove('unit--tick');
      void cell.wrap.offsetWidth; // restart the animation
      cell.wrap.classList.add('unit--tick');
    }
  }

  const through = b.arrived ? 1 : 1 - Math.min(1, Math.max(0, b.remaining / RUNWAY));
  el.progress.style.width = (through * 100).toFixed(2) + '%';
  el.timeline.hidden = through <= 0; // still more than a year out: nothing to show

  document.body.classList.toggle('is-arrived', b.arrived);
  el.tagline.textContent = b.arrived ? settings.arrivedText : settings.tagline;
  el.eyebrow.hidden = b.arrived;

  // Screen readers get a once-a-minute summary rather than a per-second barrage.
  if (b.seconds === 0 || el.sr.textContent === '') {
    el.sr.textContent = b.arrived
      ? settings.arrivedText
      : `${b.months} months, ${b.days} days, ${b.hours} hours and ${b.minutes} minutes remaining.`;
  }
  return b;
}

/* ------------------------------------------------------------------ clock -- */

function timeText() {
  const opts = { hour: '2-digit', minute: '2-digit' };
  if (settings.clockSeconds) opts.second = '2-digit';
  // hourCycle rather than hour12, so midnight reads 00 and not 24.
  if (settings.clock24 === true) opts.hourCycle = 'h23';
  else if (settings.clock24 === false) opts.hour12 = true;
  return new Date().toLocaleTimeString([], opts);
}

/**
 * The clock is built one character at a time so a changing digit can animate on
 * its own. Replacing the whole string would restart every digit each second.
 */
const clockCells = [];

function buildClock(text) {
  el.clock.textContent = '';
  clockCells.length = 0;
  for (const ch of text) {
    const cell = document.createElement('span');
    const isDigit = ch >= '0' && ch <= '9';
    cell.className = isDigit ? 'hud__digit' : 'hud__fixed';
    cell.textContent = ch;
    el.clock.append(cell);
    clockCells.push(cell);
  }
}

function paintClock() {
  if (!settings.showClock) return;
  const text = timeText();

  if (clockCells.length !== text.length) buildClock(text);
  else {
    for (let i = 0; i < text.length; i++) {
      const cell = clockCells[i];
      if (cell.textContent === text[i]) continue;
      cell.textContent = text[i];
      if (!settings.motion) continue;
      cell.classList.remove('is-rolling');
      void cell.offsetWidth; // restart the animation
      cell.classList.add('is-rolling');
    }
  }

  el.date.textContent = new Date().toLocaleDateString([],
    { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Tick on the second boundary, not every 1000ms of drift. */
function schedule() {
  clearTimeout(timer);
  const tick = () => {
    paint();
    paintClock();
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 8);
  };
  tick();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else schedule();
});

/* ---------------------------------------------------------------- tiles -- */

const FALLBACK_TILES = [
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Maps', url: 'https://maps.google.com' },
  { title: 'Drive', url: 'https://drive.google.com' },
  { title: 'Calendar', url: 'https://calendar.google.com' },
];

const faviconURL = (pageUrl) =>
  chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`);

/**
 * Chrome's favicon service always answers. When it holds no icon for a site it
 * serves a generic globe instead of failing, so an <img> error handler never
 * fires and every unvisited site showed that globe.
 *
 * Instead, ask for the icon of a host Chrome certainly knows nothing about and
 * remember what comes back. Any tile whose icon is pixel-identical to it has no
 * real favicon. Calibrating rather than hardcoding means this keeps working when
 * Chrome changes that placeholder.
 */
const NO_SUCH_HOST = 'https://no-icon-for-this.invalid/';
let placeholderProbe = null;

function hashIcon(img) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 16, 16);
  const { data } = ctx.getImageData(0, 0, 16, 16);
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
  return h >>> 0;
}

function loadIcon(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Memoises the promise, not the result: every tile asks at once, and caching
 *  only the resolved value would fire one probe per tile. */
function placeholderSignature() {
  if (!placeholderProbe) {
    placeholderProbe = loadIcon(faviconURL(NO_SUCH_HOST))
      // NaN compares unequal to everything, so a failed probe simply treats
      // every icon as real - the old behaviour, rather than no icons at all.
      .then((img) => (img ? hashIcon(img) : NaN));
  }
  return placeholderProbe;
}

const initial = (site) => {
  const source = (site.title || site.url.replace(/^https?:\/\/(www\.)?/, '')).trim();
  return source ? source[0].toUpperCase() : '?';
};

/** Shows the letter straight away, and swaps in a real icon only if there is one. */
async function paintChip(chip, site) {
  const letter = document.createElement('span');
  letter.textContent = initial(site);
  chip.append(letter);

  const [img, placeholder] = await Promise.all([
    loadIcon(faviconURL(site.url)),
    placeholderSignature(),
  ]);
  if (!img) return;

  let hash;
  try {
    hash = hashIcon(img);
  } catch {
    return; // canvas unavailable; the letter is a fine result
  }
  if (hash === placeholder) return; // Chrome only had its generic globe

  img.alt = '';
  chip.textContent = '';
  chip.append(img);
}

function renderTiles(list) {
  el.tiles.textContent = '';
  for (const site of list.slice(0, 10)) {
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = site.url;

    const chip = document.createElement('span');
    chip.className = 'tile__chip glass';

    const name = document.createElement('span');
    name.className = 'tile__name';
    name.textContent = site.title || new URL(site.url).hostname.replace(/^www\./, '');

    a.append(chip, name);
    el.tiles.append(a);
    paintChip(chip, site);
  }
}

async function loadTiles() {
  if (!settings.showTiles) {
    el.tiles.hidden = true;
    el.enableTiles.hidden = true;
    return;
  }
  el.tiles.hidden = false;

  if (settings.tiles.length) {
    el.enableTiles.hidden = true;
    renderTiles(settings.tiles);
    return;
  }

  // Most-visited sites need a permission the user opts into, so the default
  // install asks for nothing and still shows something useful.
  const granted = await chrome.permissions.contains({ permissions: ['topSites'] });
  if (granted) {
    el.enableTiles.hidden = true;
    try {
      const sites = await chrome.topSites.get();
      renderTiles(sites.length ? sites : FALLBACK_TILES);
      return;
    } catch { /* fall through to the defaults */ }
  }
  el.enableTiles.hidden = false;
  renderTiles(FALLBACK_TILES);
}

el.enableTiles.addEventListener('click', async () => {
  const ok = await chrome.permissions.request({ permissions: ['topSites'] });
  if (ok) loadTiles();
});

/* --------------------------------------------------------------- search -- */

const LOOKS_LIKE_URL = /^(https?:\/\/|localhost[:/]|(\d{1,3}\.){3}\d{1,3}|[\w-]+(\.[\w-]+)+(\/|$))/i;

el.search.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = el.q.value.trim();
  if (!text) return;

  if (LOOKS_LIKE_URL.test(text) && !text.includes(' ')) {
    location.assign(/^https?:\/\//i.test(text) ? text : 'https://' + text);
    return;
  }
  // Use whichever engine the profile is actually set to, not a hardcoded one.
  if (chrome.search?.query) chrome.search.query({ text, disposition: 'CURRENT_TAB' });
  else location.assign('https://www.google.com/search?q=' + encodeURIComponent(text));
});

/* ---------------------------------------------------------------- motes -- */

/** Slow drifting dust in the light. Cheap: a few dozen points, no trails. */
function startMotes() {
  const canvas = document.getElementById('motes');
  const ctx = canvas.getContext('2d', { alpha: true });
  let w = 0, h = 0, dots = [], raf = null;

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(64, (w * h) / 26000));
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.7,
      vy: 0.06 + Math.random() * 0.22,
      vx: -0.16 + Math.random() * 0.1,
      a: 0.06 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
    }));
  };

  const frame = (t) => {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.y += d.vy;
      d.x += d.vx;
      if (d.y - d.r > h) { d.y = -d.r; d.x = Math.random() * w; }
      if (d.x + d.r < 0) d.x = w + d.r;
      const twinkle = 0.65 + 0.35 * Math.sin(t / 900 + d.phase);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(182, 244, 186, ${d.a * twinkle})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };

  const stop = () => { cancelAnimationFrame(raf); raf = null; };
  const start = () => { if (raf === null) raf = requestAnimationFrame(frame); };

  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize();
  start();
}

/* ----------------------------------------------------------------- boot -- */

function apply() {
  const parsed = new Date(settings.target);
  target = isNaN(parsed) ? new Date(DEFAULTS.target) : parsed;

  // The bare :root rules are the default palette, so 'zero' needs no attribute
  // - but setting it anyway keeps the DOM honest about what is showing.
  document.documentElement.dataset.palette = settings.palette;
  el.sigil.src = `assets/sigil-${settings.palette}.png`;

  el.title.textContent = settings.title;
  el.tagline.textContent = settings.tagline;
  document.title = settings.title ? `${settings.title} — New Tab` : 'New Tab';

  el.clockWrap.hidden = !settings.showClock;
  clockCells.length = 0; // force a rebuild: the format may have changed
  el.search.hidden = !settings.showSearch;
  document.body.classList.toggle('letterbox', settings.letterbox);

  const still = !settings.motion ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.toggle('no-motion', still);

  paintClock();
  paint();
  loadTiles();
}

async function boot() {
  settings = await loadSettings();
  buildCounter();
  apply();
  schedule();
  if (!document.body.classList.contains('no-motion')) startMotes();

  requestAnimationFrame(() => document.body.classList.remove('is-booting'));
  if (settings.showSearch) el.q.focus({ preventScroll: true });
}

// Options changes take effect on tabs that are already open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
  apply();
});

boot();
