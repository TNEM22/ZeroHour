/** Settings shape and defaults, shared by the new tab, popup and options page. */

/**
 * Store listing for each palette's browser theme. A theme's colours are fixed in
 * its manifest and no API can change them at runtime, so each palette ships as
 * its own package. Fill these in once the listings are live.
 */
/**
 * Where the "get the matching theme" link points.
 *
 * Prefer a page you control (your repo, or a GitHub Pages page) over a store
 * listing URL. A store URL only exists after the theme is published, so baking
 * one in means submitting the extension a second time just to add a link — and
 * again for every store you add. A page you own can be edited any time without
 * touching the extension at all.
 *
 * `chrome` and `edge` override `default` when set, so an Edge user is never
 * sent to the Chrome Web Store.
 */
export const THEME_URLS = {
  default: '',
  chrome: 'https://chromewebstore.google.com/detail/kbgnjhikolnmknhibojckjfanfdbapak',
  edge: '',
};

/** Which store this copy was most likely installed from. */
export function storeKey() {
  return / Edg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
}

/** Resolves to '' when nothing is configured, which hides the link entirely. */
export function themeUrl() {
  return THEME_URLS[storeKey()] || THEME_URLS.default || '';
}

export const DEFAULTS = {
  // Local wall-clock time of the event, pre-set to 18 Dec 2026.
  // Change it in Options for any other date.
  target: '2026-12-18T00:00',
  palette: 'zero',
  title: 'ZERO HOUR',
  tagline: 'ALL TIMELINES CONVERGE',
  arrivedText: 'THE HOUR HAS COME',
  showClock: true,
  clockSeconds: true,
  // null follows the system locale; true or false forces 24- or 12-hour.
  clock24: null,
  showSearch: true,
  showTiles: true,
  letterbox: false,
  motion: true,
  tiles: [],        // user-defined [{title, url}]; empty falls back to most-visited
  accentWeb: false, // restyle scrollbars/selection on ordinary web pages
};

/** Settings are small and worth syncing across the signed-in profile. */
export async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

/**
 * Writes are coalesced before they reach sync storage.
 *
 * The options page saves on every `input` event, so typing a tagline used to be
 * one write per keystroke. chrome.storage.sync caps writes (120 a minute, 1800
 * an hour) and replicates each one to every signed-in device, so a burst of
 * typing could hit the cap and start silently failing to save.
 *
 * Edits are merged into one pending batch and written once the user pauses. The
 * returned promise settles when that write actually lands, so callers can still
 * report success or failure honestly.
 */
const WRITE_DELAY = 500;

let pending = null;
let timer = null;
let waiting = [];

function flushNow() {
  clearTimeout(timer);
  timer = null;
  if (!pending) return Promise.resolve();

  const batch = pending;
  const settle = waiting;
  pending = null;
  waiting = [];

  return chrome.storage.sync.set(batch).then(
    () => settle.forEach((w) => w.resolve()),
    (error) => settle.forEach((w) => w.reject(error)),
  );
}

export function saveSettings(patch) {
  pending = { ...pending, ...patch };
  clearTimeout(timer);
  timer = setTimeout(flushNow, WRITE_DELAY);
  return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
}

/** Write anything still pending immediately - call before the page goes away. */
export function flushSettings() {
  return flushNow();
}
