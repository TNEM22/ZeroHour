import { loadSettings, DEFAULTS } from './defaults.js';
import { breakdown, pad2, UNITS } from './countdown.js';

// Slicing the unit names gives "MON" and "HOU"; spell the short forms out.
const SHORT = { months: 'MTH', days: 'DAY', hours: 'HRS', minutes: 'MIN', seconds: 'SEC' };

const counter = document.getElementById('counter');
const cells = new Map();

for (const [i, unit] of UNITS.entries()) {
  if (i > 0) {
    const sep = document.createElement('span');
    sep.className = 'counter__sep';
    sep.textContent = ':';
    counter.append(sep);
  }
  const wrap = document.createElement('div');
  wrap.className = 'unit';
  const value = document.createElement('span');
  value.className = 'unit__value';
  value.textContent = '00';
  const label = document.createElement('span');
  label.className = 'unit__label';
  label.textContent = SHORT[unit];
  wrap.append(value, label);
  counter.append(wrap);
  cells.set(unit, value);
}

const settings = await loadSettings();
const target = isNaN(new Date(settings.target)) ? new Date(DEFAULTS.target) : new Date(settings.target);

document.documentElement.dataset.palette = settings.palette;
document.querySelector('.pop__head img').src = `assets/sigil-${settings.palette}.png`;
document.getElementById('title').textContent = settings.title;
document.getElementById('when').textContent = target.toLocaleDateString([], {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
});

function tick() {
  const b = breakdown(new Date(), target);
  for (const unit of UNITS) cells.get(unit).textContent = pad2(b[unit]);
  document.querySelector('.pop').classList.toggle('is-arrived', b.arrived);
}

tick();
setInterval(tick, 1000);
