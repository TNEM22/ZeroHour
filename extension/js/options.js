import { DEFAULTS, themeUrl, loadSettings, saveSettings, flushSettings } from './defaults.js';
import { PALETTE_LIST } from './palettes.js';
import { breakdown, pad2 } from './countdown.js';

const $ = (id) => document.getElementById(id);
const TEXTS = ['target', 'title', 'tagline', 'arrivedText'];
const FLAGS = ['showClock', 'clockSeconds', 'showSearch', 'showTiles', 'letterbox', 'motion'];
const HOSTS = { origins: ['http://*/*', 'https://*/*'] };

let settings = { ...DEFAULTS };
let statusTimer = null;

function flash(text) {
  const status = $('status');
  status.textContent = text;
  status.classList.add('is-on');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.classList.remove('is-on'), 1600);
}

async function save(patch) {
  // Applied locally straight away so the UI stays responsive; the write itself
  // is batched and lands once typing stops.
  Object.assign(settings, patch);
  try {
    await saveSettings(patch);
    flash('Saved');
  } catch (error) {
    // Sync storage refuses writes past its quota. Say so rather than showing
    // "Saved" over a change that was never stored.
    console.error('[zero hour] could not save:', error);
    flash('Not saved');
  }
}

// A batched write is still waiting when the tab is closed or hidden; without
// this the last thing typed would be lost.
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSettings();
});
addEventListener('pagehide', () => flushSettings());

/* -------------------------------------------------------------- preview -- */

function refreshPreview() {
  const when = new Date(settings.target);
  const hint = $('targetHint');

  if (isNaN(when)) {
    $('preview').textContent = 'Set a date';
    hint.textContent = 'That date could not be read.';
    return;
  }

  hint.textContent = when.toLocaleDateString([], {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }) + ' at ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const b = breakdown(new Date(), when);
  $('preview').textContent = b.arrived
    ? (settings.arrivedText || DEFAULTS.arrivedText)
    : [b.months, b.days, b.hours, b.minutes, b.seconds].map(pad2).join(' : ');
}

/* ------------------------------------------------------------ shortcuts -- */

function addRow(tile = { title: '', url: '' }) {
  const row = document.createElement('div');
  row.className = 'row';

  const title = document.createElement('input');
  title.className = 'glass-field';
  title.type = 'text';
  title.placeholder = 'Name';
  title.value = tile.title || '';
  title.setAttribute('aria-label', 'Shortcut name');

  const url = document.createElement('input');
  url.className = 'glass-field';
  url.type = 'url';
  url.placeholder = 'https://example.com';
  url.value = tile.url || '';
  url.setAttribute('aria-label', 'Shortcut address');

  const drop = document.createElement('button');
  drop.type = 'button';
  drop.className = 'row__drop glass glass--tap';
  drop.textContent = '\u00d7';
  drop.title = 'Remove';
  drop.setAttribute('aria-label', 'Remove shortcut');

  drop.addEventListener('click', () => { row.remove(); commitRows(); });
  title.addEventListener('input', commitRows);
  url.addEventListener('input', commitRows);

  row.append(title, url, drop);
  $('rows').append(row);
  return row;
}

/** Only rows with a usable address are stored; half-typed rows stay on screen. */
function commitRows() {
  const tiles = [];
  for (const row of $('rows').children) {
    const [title, url] = row.querySelectorAll('input');
    const href = url.value.trim();
    if (!href) continue;
    tiles.push({
      title: title.value.trim(),
      url: /^https?:\/\//i.test(href) ? href : 'https://' + href,
    });
  }
  save({ tiles });
}

/* ----------------------------------------------------------- web accent -- */

async function syncAccentUI() {
  const held = await chrome.permissions.contains(HOSTS);
  const note = $('accentNote');
  $('accentWeb').checked = settings.accentWeb && held;
  if (settings.accentWeb && !held) {
    note.textContent = 'Access to websites was revoked, so the accent is off. Switch it on again to re-request it.';
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}

$('accentWeb').addEventListener('change', async (event) => {
  const on = event.target.checked;
  // permissions.request must be the first await in a user gesture, or Chrome
  // treats the call as programmatic and rejects it.
  if (on) {
    const granted = await chrome.permissions.request(HOSTS);
    if (!granted) {
      event.target.checked = false;
      flash('Not granted');
      return;
    }
  } else {
    await chrome.permissions.remove(HOSTS);
  }
  await save({ accentWeb: on });
  syncAccentUI();
});

/* ----------------------------------------------------------------- wire -- */

for (const key of TEXTS) {
  const input = $(key);
  input.addEventListener('input', () => {
    const value = input.value.trim();
    // An empty optional field falls back to the default rather than vanishing.
    save({ [key]: value || DEFAULTS[key] });
    refreshPreview();
  });
}

for (const key of FLAGS) {
  $(key).addEventListener('change', (event) => save({ [key]: event.target.checked }));
}

$('addRow').addEventListener('click', () => addRow().querySelector('input').focus());

$('reset').addEventListener('click', async () => {
  await chrome.storage.sync.clear();
  await chrome.permissions.remove(HOSTS).catch(() => {});
  settings = { ...DEFAULTS };
  fill();
  flash('Reset');
});

/* ------------------------------------------------------------- palettes -- */

function markThemeLink() {
  const url = themeUrl();
  $('themeLink').hidden = !url;
  $('themeSoon').hidden = !!url;
  if (url) $('themeLink').href = url;
}

function markPalette(key) {
  document.documentElement.dataset.palette = key;
  markThemeLink();
  for (const button of $('palettes').children) {
    const on = button.dataset.key === key;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-checked', String(on));
    button.tabIndex = on ? 0 : -1;
  }
}

function buildPalettes() {
  const box = $('palettes');
  box.textContent = '';
  for (const palette of PALETTE_LIST) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch glass glass--tap';
    button.dataset.key = palette.key;
    button.setAttribute('role', 'radio');

    const strip = document.createElement('span');
    strip.className = 'swatch__strip';
    for (const colour of palette.swatch) {
      const dot = document.createElement('span');
      dot.style.background = colour;
      strip.append(dot);
    }

    const name = document.createElement('span');
    name.className = 'swatch__name';
    name.textContent = palette.label;

    button.append(strip, name);
    button.addEventListener('click', () => {
      markPalette(palette.key);
      save({ palette: palette.key });
    });
    box.append(button);
  }
}

/** Does this locale show AM/PM by default? */
function localeIs24() {
  return !/(AM|PM)/i.test(
    new Date(2020, 0, 1, 13).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
}

// clock24 is null until touched, meaning "follow the system"; the checkbox
// therefore starts at whatever the locale actually does.
$('clock24').addEventListener('change', (event) => save({ clock24: event.target.checked }));

function fill() {
  buildPalettes();
  markPalette(settings.palette || DEFAULTS.palette);
  for (const key of TEXTS) $(key).value = settings[key] ?? '';
  for (const key of FLAGS) $(key).checked = !!settings[key];
  $('clock24').checked = settings.clock24 === null || settings.clock24 === undefined
    ? localeIs24()
    : settings.clock24;
  $('rows').textContent = '';
  for (const tile of settings.tiles) addRow(tile);
  syncAccentUI();
  refreshPreview();
}

(async function boot() {
  settings = await loadSettings();
  fill();
  setInterval(refreshPreview, 1000);
})();
