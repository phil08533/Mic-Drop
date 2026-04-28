// Boot + screen routing. Any clickable element with [data-action]
// is dispatched here so individual screens stay declarative.

import { $, tpl, clear } from './ui.js';
import { loadDecks } from './cards.js';
import { settings, game } from './state.js';
import { mountMusic, openMusic, closeMusic } from './music.js';
import { mountSettings, openSettings, closeSettings } from './settings.js';
import { renderCrewSetup, renderCrewBattle } from './teamBattle.js';
import { renderKothSetup, renderKothBattle } from './kingOfHill.js';

const screen = $('#screen');
const app = $('#app');
const back = $('#back-btn');

// --- routing ---
const screens = {
  home: () => fromTemplate('tpl-home'),
  how: () => fromTemplate('tpl-how'),
  'crew-setup': renderCrewSetup,
  'crew-battle': renderCrewBattle,
  'koth-setup': renderKothSetup,
  'koth-battle': renderKothBattle,
};

const stack = [];

export function go(name, opts = {}) {
  const render = screens[name];
  if (!render) { console.warn('Unknown screen', name); return; }
  if (!opts.replace && stack.at(-1) !== name) stack.push(name);
  app.dataset.screen = name;
  back.hidden = stack.length <= 1 || name === 'home';
  clear(screen);
  const node = render({ go });
  if (node instanceof Node) screen.appendChild(node);
}

function fromTemplate(id) { return tpl(id); }

function backTo() {
  if (stack.length > 1) {
    stack.pop();
    const prev = stack.at(-1);
    go(prev, { replace: true });
  } else {
    go('home', { replace: true });
  }
}

// --- global action handler ---
const ACTIONS = {
  home() { stack.length = 0; game.reset(); go('home'); },
  how() { go('how'); },
  'start-crew'() { game.mode = 'crew'; go('crew-setup'); },
  'start-koth'() { game.mode = 'koth'; go('koth-setup'); },
  'open-music'() { openMusic(); },
  'open-settings'() { openSettings(); },
};

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (ACTIONS[action]) {
    e.preventDefault();
    ACTIONS[action](e, target);
  }
});

back.addEventListener('click', backTo);
$('#music-toggle').addEventListener('click', openMusic);
$('#settings-toggle').addEventListener('click', openSettings);
$('#scrim').addEventListener('click', () => { closeMusic(); closeSettings(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMusic(); closeSettings(); }
});

// --- boot ---
async function boot() {
  // Apply persisted settings (theme is applied in state.js on import).
  if (settings.get('reducedMotion')) document.documentElement.style.setProperty('--motion', 'none');
  try {
    await loadDecks();
    go('home', { replace: true });
  } catch (err) {
    screen.innerHTML = `
      <div class="loader">Failed to load card decks. Try refreshing.<br><br>
      <code>${(err && err.message) || err}</code></div>`;
  }
  mountMusic();
  mountSettings();
}

boot();

// Expose for in-mode navigation.
window.MicDrop = { go };
