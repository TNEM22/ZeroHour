/**
 * Keeps the optional "accent on web pages" content script in step with both the
 * setting and the host permission. Either can change independently - the user
 * can revoke site access from chrome://extensions without touching the toggle -
 * so the registration is derived from both every time.
 */
import { loadSettings } from './defaults.js';

const SCRIPT_ID = 'zero-hour-web-accent';

// A dynamic registration survives browser restarts, so simply renaming the id
// would strand the old one: it would keep injecting its stylesheet forever with
// nothing left in the UI able to reach it. Every pass clears any registration
// left behind under a previous name.
const LEGACY_IDS = ['doom-web-accent'];
const HOSTS = { origins: ['http://*/*', 'https://*/*'] };

const cssFor = (palette) => ['css/web-accent-' + (palette || 'zero') + '.css'];

const scriptFor = (palette) => ({
  id: SCRIPT_ID,
  matches: HOSTS.origins,
  css: cssFor(palette),
  runAt: 'document_start',
  allFrames: false,
  persistAcrossSessions: true,
});

const says = (error, text) => String(error && error.message).toLowerCase().includes(text);

async function dropLegacy() {
  for (const id of LEGACY_IDS) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
    } catch { /* never registered under that name - nothing to clean up */ }
  }
}

async function run() {
  await dropLegacy();

  const [settings, held] = await Promise.all([
    loadSettings(),
    chrome.permissions.contains(HOSTS),
  ]);
  const wanted = settings.accentWeb && held;
  const css = cssFor(settings.palette);
  const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });

  // Already registered with the right palette's stylesheet.
  if (wanted && existing && String(existing.css) === String(css)) return;
  if (!wanted && !existing) return;

  if (existing) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    } catch (error) {
      if (!says(error, 'nonexistent') && !says(error, 'does not exist')) throw error;
    }
  }

  if (!wanted) return;

  try {
    await chrome.scripting.registerContentScripts([scriptFor(settings.palette)]);
  } catch (error) {
    // Registered between our check and this call. Nothing to repair.
    if (!says(error, 'duplicate script id')) throw error;
  }
}

/**
 * Turning the accent on fires storage.onChanged and permissions.onAdded at
 * almost the same instant. Run concurrently, both passes read "not registered"
 * and both tried to register, and the loser threw "Duplicate script ID". Each
 * pass therefore waits for the one before it.
 */
let chain = Promise.resolve();

function sync() {
  chain = chain
    .catch(() => {}) // a failed pass must not stall every pass after it
    .then(run)
    .catch((error) => console.error('[zero hour] could not sync the web accent:', error));
  return chain;
}

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.permissions.onAdded.addListener(sync);
chrome.permissions.onRemoved.addListener(sync);
chrome.storage.onChanged.addListener((changes, area) => {
  // A palette change swaps which stylesheet is injected, so it matters here too.
  if (area === 'sync' && (changes.accentWeb || changes.palette)) sync();
});
