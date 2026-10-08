// "How to play": the whole game in four steps, plus a few tips for the screen
// you're on. Opens from the button in the top bar, and once on its own the
// first time someone sets up a game.

import { el } from './ui.js';
import { icon } from './icons.js';

const SEEN_KEY = 'micdrop:guide:v1';

const STEPS = [
  ['crown', 'Pick a mode', 'King of the Hill: everyone in one line, the winner stays on. Crew Battle: teams go head to head.'],
  ['cards', 'Flip your cards', 'Burn (roast the other rapper) or Boast (hype yourself), plus a word you have to rhyme. What you say is up to you.'],
  ['bell', 'Ding ding, rap', 'The bell drops the beat and starts the clock. One verse each.'],
  ['mic', 'Pick a winner', 'Tap who won, or let the room cheer it out. Most wins takes the night.'],
];

const BOUT_TIPS = [
  'Tap the striped cards to flip them: Burn or Boast, and a word to rhyme.',
  'Press Ding ding (or the Space bar) to start the clock. Done skips ahead if someone finishes early.',
  'A bar so good the room explodes? Tap Mic drop twice: instant win, double points.',
  'The soundboard at the bottom has an air horn. You know what to do.',
];

const RESULT_TIPS = ['Run it back plays again with the same people and a fresh score.'];

const TIPS = {
  home: [
    'Quickest start: King of the Hill. Type everyone’s name and press Start.',
    'Beats are built in, so the Beat Lab is optional.',
  ],
  'crew-setup': [
    'Name your crews and type who’s rapping. Ages are optional: the oldest crew goes first.',
    'With 2 crews, everyone watching judges. With 3, the crew sitting out judges and you rotate.',
  ],
  'koth-setup': [
    'Type everyone’s name and press Start the cypher. People can jump in later.',
    'The winner of each bout stays on. The loser goes to the back of the line.',
  ],
  'crew-battle': BOUT_TIPS,
  'koth-battle': BOUT_TIPS,
  'crew-results': RESULT_TIPS,
  'koth-results': RESULT_TIPS,
  'beat-lab': [
    'Press Play, then tap squares to add sounds. Each row is one sound.',
    'Stuck? Pick a preset or hit Shake it up.',
    'Save it and it shows up in the Beats player under My Beats.',
  ],
};

export function openGuide(screen) {
  document.querySelector('.guide-wrap')?.remove();
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }

  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const tips = TIPS[screen] || [];
  const done = el('button', { class: 'btn ink', onClick: close }, 'Got it');

  const wrap = el('div', { class: 'dialog-wrap guide-wrap', onClick: (e) => { if (e.target === wrap) close(); } },
    el('div', { class: 'dialog guide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-title' },
      el('button', { class: 'btn icon closebtn', 'aria-label': 'Close', onClick: close }, icon('close', 18)),
      el('header', {},
        el('p', { class: 'kicker' }, 'How to play'),
        el('h3', { class: 'guide-title', id: 'guide-title' }, 'Four steps. That’s the game.')),
      el('ol', { class: 'guide-steps' },
        ...STEPS.map(([ic, title, text]) => el('li', {},
          el('strong', {}, icon(ic, 20), title),
          el('p', {}, text)))),
      tips.length ? el('div', { class: 'guide-tips' },
        el('h4', {}, 'On this screen'),
        el('ul', {}, ...tips.map((t) => el('li', {}, t)))) : null,
      el('div', { class: 'btnrow end' },
        screen !== 'how'
          ? el('button', { class: 'btn', onClick: () => { close(); window.MicDrop.go('how'); } }, 'Full rules')
          : null,
        done)));

  document.body.appendChild(wrap);
  document.addEventListener('keydown', onKey);
  done.focus();
}

// Show the guide by itself once, the first time someone sets up a game.
export function firstTimeGuide(screen) {
  if (screen !== 'crew-setup' && screen !== 'koth-setup') return;
  try { if (localStorage.getItem(SEEN_KEY)) return; } catch { return; }
  setTimeout(() => openGuide(screen), 250);
}
