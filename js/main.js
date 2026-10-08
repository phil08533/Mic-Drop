// Boot + screen routing. Any clickable element with [data-action]
// is dispatched here so individual screens stay declarative.

import { $, tpl, clear, toast } from './ui.js';
import { loadDecks } from './cards.js';
import { settings, game } from './state.js';
import { mountMusic, openMusic, closeMusic } from './music.js';
import { mountSettings, openSettings, closeSettings } from './settings.js';
import { renderCrewSetup, renderCrewBattle, renderCrewResults } from './teamBattle.js';
import { renderKothSetup, renderKothBattle, renderKothResults } from './kingOfHill.js';
import { renderBeatLab, openPattern } from './beatlab.js';
import { decodeBeat } from './beatstore.js';
import { openVisualizer } from './visualizer.js';
import { openGuide, firstTimeGuide } from './guide.js';
import { onMixerChange, nowPlaying, isPlaying, mixer } from './mixer.js';
import { stagefx } from './stagefx.js';

const screen = $('#screen');
const app = $('#app');
const back = $('#back-btn');

// --- routing ---
const screens = {
  home: () => { stagefx.base(0.62); return tpl('tpl-home'); },
  how: () => { stagefx.base(0.3); return tpl('tpl-how'); },
  'crew-setup': renderCrewSetup,
  'crew-battle': renderCrewBattle,
  'crew-results': renderCrewResults,
  'koth-setup': renderKothSetup,
  'koth-battle': renderKothBattle,
  'koth-results': renderKothResults,
  'beat-lab': (ctx) => { stagefx.base(0.28); return renderBeatLab(ctx); },
};

const stack = [];

export function go(name, opts = {}) {
  const render = screens[name];
  if (!render) { console.warn('Unknown screen', name); return; }
  if (!opts.replace && stack.at(-1) !== name) stack.push(name);
  if (opts.replace && stack.length) stack[stack.length - 1] = name;
  const changed = app.dataset.screen !== name;
  app.dataset.screen = name;
  back.hidden = stack.length <= 1 || name === 'home';
  clear(screen);
  const node = render({ go });
  if (node instanceof Node) screen.appendChild(node);
  if (changed) window.scrollTo(0, 0);
  if (!opts.replace) firstTimeGuide(name);
}

function backTo() {
  if (stack.length > 1) {
    stack.pop();
    go(stack.at(-1), { replace: true });
  } else {
    go('home', { replace: true });
  }
}

// --- global action handler ---
const ACTIONS = {
  home() { stack.length = 0; game.reset(); go('home'); },
  how() { go('how'); },
  help() { openGuide(app.dataset.screen); },
  'start-crew'() { game.mode = 'crew'; go(game.crew?.started ? 'crew-battle' : 'crew-setup'); },
  'start-koth'() { game.mode = 'koth'; go(game.koth?.started ? 'koth-battle' : 'koth-setup'); },
  'beat-lab'() { go('beat-lab'); },
  'open-music'() { openMusic(); },
  'open-settings'() { openSettings(); },
  'open-viz'() { openVisualizer(); },
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
$('#scrim').addEventListener('click', () => { closeMusic(); closeSettings(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMusic(); closeSettings(); }
});

// --- now playing chip in the top bar ---
const np = $('#now-playing');
function paintNowPlaying() {
  const t = nowPlaying();
  np.hidden = !t;
  if (!t) return;
  np.classList.toggle('paused', !isPlaying());
  np.querySelector('.np-title').textContent = t.title || t.file;
  np.querySelector('.np-bpm').textContent = t.bpm ? `${Math.round(mixer.tempo || t.bpm)} BPM` : '';
}
onMixerChange(paintNowPlaying);

// --- settings that change the stage ---
window.addEventListener('micdrop:settings', (e) => {
  if (e.detail === 'theme' || e.detail === '*') stagefx.palette(settings.get('theme'));
});
window.addEventListener('micdrop:motion', (e) => stagefx.still(e.detail));

// --- shared beat links: #beat=... opens it in the Beat Lab ---
function openSharedBeat() {
  const m = location.hash.match(/^#beat=([\w-]+)/);
  if (!m) return false;
  const p = decodeBeat(m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  if (!p) { toast('That beat link is broken.'); return false; }
  openPattern(p);
  stack.length = 0;
  stack.push('home');
  go('beat-lab');
  toast(p.name ? `Loaded “${p.name}”. Hit play.` : 'Loaded a shared beat. Hit play.');
  return true;
}
window.addEventListener('hashchange', openSharedBeat);

// --- boot ---
async function boot() {
  const still = settings.get('reducedMotion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (settings.get('reducedMotion')) document.documentElement.setAttribute('data-reduce-motion', '');
  stagefx.mount($('#fire'), { palette: settings.get('theme'), still });
  try {
    await loadDecks();
    if (!openSharedBeat()) go('home', { replace: true });
  } catch (err) {
    screen.innerHTML = `
      <div class="loader">Couldn't load the card decks. Try refreshing.<br><br>
      <code>${(err && err.message) || err}</code></div>`;
  }
  mountMusic();
  mountSettings();
  paintNowPlaying();
}

boot();

// Expose for in-mode navigation.
window.MicDrop = { go };
