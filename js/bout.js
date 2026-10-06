// One bout: two rappers, their cards, a verse each and a decision.
// Shared by Crew Battle and King of the Hill.
//
// Flow: draw (flip cards) -> verse 1 -> hand-off -> verse 2 -> decide.
// The beat drops with the bell, the fire climbs as the clock runs down, and a
// MIC DROP during a verse ends the bout on the spot for double points.

import { el, stamp, toast } from './ui.js';
import { icon } from './icons.js';
import { settings } from './state.js';
import { sfx } from './sfx.js';
import { stagefx } from './stagefx.js';
import { crowdVote } from './crowd.js';
import { isPlaying, playTrack, pickNext, mixer, duck, pullUp } from './mixer.js';

export function newBout(twist = null) {
  return { phase: 'draw', turn: 0, clock: null, twist, pending: false };
}

let live = null;            // { bout, o } currently on screen; the clock ticks against it

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// o = { bout, corners: [{name, color, tag, hand, crown?, sub?}] x2, order: [first, second],
//       head: {kicker, title}, judges: {label, name, color?}, onDecide(idx, micDrop), rerender() }
export function renderBout(o) {
  const { bout, corners, order } = o;
  live = { bout, o };
  if (bout.clock?.running) bout.clock.last = performance.now();
  const rapping = bout.phase === 'verse' ? order[bout.turn] : -1;

  const root = el('div', { class: `bout phase-${bout.phase}` });

  root.appendChild(el('div', { class: 'bout-head' },
    el('div', {},
      el('p', { class: 'kicker' }, o.head.kicker),
      el('h2', { class: 'bout-title' }, o.head.title)),
    o.judges ? el('div', { class: `judges ${o.judges.color || ''}` },
      el('span', { class: 'judges-label' }, o.judges.label),
      el('strong', {}, o.judges.name)) : null));

  if (bout.twist) {
    root.appendChild(el('div', { class: 'twist' },
      el('span', { class: 'twist-tag' }, 'Twist'),
      el('p', {}, bout.twist.text),
      el('span', { class: 'fine' }, 'Both rappers.')));
  }

  root.appendChild(phaseStrip(o));

  root.appendChild(el('div', { class: 'ring' },
    cornerEl(corners[0], 'left', rapping === 0, bout.phase === 'verse' && rapping !== 0),
    centerEl(o),
    cornerEl(corners[1], 'right', rapping === 1, bout.phase === 'verse' && rapping !== 1)));

  root.appendChild(soundboard());
  return root;
}

function phaseStrip({ bout, corners, order }) {
  const at = { draw: 0, verse: bout.turn + 1, handoff: 1.5, decide: 3 }[bout.phase];
  const steps = ['Draw cards', `${corners[order[0]].name} raps`, `${corners[order[1]].name} answers`, 'Decision'];
  return el('ol', { class: 'phases', 'aria-label': 'Bout progress' },
    ...steps.map((s, i) => el('li', {
      class: i < at ? 'done' : i === at ? 'now' : '',
      'aria-current': i === at ? 'step' : null,
    }, el('span', { class: 'ph-n' }, String(i + 1)), el('span', { class: 'ph-t' }, s))));
}

function cornerEl(c, side, onMic, waiting) {
  return el('section', { class: `corner ${c.color} ${side}${onMic ? ' on-mic' : ''}${waiting ? ' waiting' : ''}` },
    el('div', { class: 'plate' },
      el('span', { class: 'plate-tag' }, c.tag),
      el('h3', { class: 'plate-name' }, c.crown ? icon('crown', 22) : null, c.name),
      c.sub ? el('span', { class: 'plate-sub' }, c.sub) : null),
    el('div', { class: 'hand' }, ...c.hand.map(cardView)));
}

export function cardView(card) {
  const back = el('div', { class: 'card-face card-back' },
    el('span', { class: 'card-back-mark' }, 'Mic', el('br'), 'Drop'),
    el('span', { class: 'card-back-hint' }, card.kind === 'rhyme' ? 'Rhyme card' : 'Prompt card'),
    el('span', { class: 'card-back-tap' }, 'Tap to flip'));
  let front;
  if (card.kind === 'rhyme') {
    front = el('div', { class: 'card-face card-front' },
      el('span', { class: 'card-tag' }, 'Rhyme'),
      el('span', { class: 'card-cue' }, 'Land a rhyme on'),
      el('strong', { class: 'card-word' }, card.anchor),
      settings.get('showRhymeHint') ? el('span', { class: 'card-hints' }, card.words.slice(1, 6).join(' · ')) : null);
  } else {
    front = el('div', { class: 'card-face card-front' },
      el('span', { class: 'card-tag' }, card.kind === 'burn' ? 'Burn' : 'Boast'),
      el('p', { class: 'card-text' }, card.text));
  }
  const btn = el('button', {
    class: `card ${card.kind}${card.__revealed ? ' flipped' : ''}`,
    'aria-label': card.__revealed ? null : `Flip ${card.kind === 'rhyme' ? 'rhyme' : 'prompt'} card`,
  }, el('div', { class: 'card-inner' }, back, front));
  btn.addEventListener('click', () => {
    if (card.__revealed) return;
    card.__revealed = true;
    btn.classList.add('flipped');
    btn.removeAttribute('aria-label');
    sfx('flip');
  });
  return btn;
}

function centerEl(o) {
  const { bout, corners, order } = o;
  const c = el('div', { class: 'ring-center' });

  if (bout.phase === 'draw' || bout.phase === 'handoff') {
    const next = corners[order[bout.phase === 'draw' ? 0 : 1]];
    c.append(
      el('div', { class: 'vs', 'aria-hidden': 'true' }, 'VS'),
      el('p', { class: 'cue' },
        bout.phase === 'draw' ? 'Flip your cards and read them out. ' : 'Time’s up. Pass the mic to ',
        el('strong', { class: `ink-${next.color}` }, next.name),
        bout.phase === 'draw' ? ' goes first.' : '.'),
      el('button', { class: 'btn ink big', onClick: () => startVerse(o, bout.phase === 'draw' ? 0 : 1) },
        icon('bell', 20), 'Ding ding'),
      el('p', { class: 'fine' }, settings.get('autoBeat') ? 'The bell starts the clock and drops the beat.' : 'The bell starts the clock.'));
  } else if (bout.phase === 'verse') {
    const who = corners[order[bout.turn]];
    const ck = bout.clock;
    const left = Math.ceil(ck.left);
    c.append(
      el('p', { class: 'onmic' }, 'On the mic'),
      el('h3', { class: `onmic-name ink-${who.color}` }, who.name),
      el('div', { class: `clock${left <= 10 ? ' warn' : ''}`, role: 'timer' },
        el('span', { class: 'clock-digits' }, fmt(left)),
        el('span', { class: 'clock-bar' }, el('span', { class: 'clock-fill', style: { width: `${(ck.left / ck.total) * 100}%` } }))),
      el('div', { class: 'btnrow center' },
        el('button', { class: 'btn', onClick: () => toggleClock(o) }, icon(ck.running ? 'pause' : 'play', 16), ck.running ? 'Pause' : 'Resume'),
        el('button', { class: 'btn', onClick: () => endVerse(o) }, 'Done', icon('next', 16))),
      dropButton(o));
  } else {
    c.append(
      el('p', { class: 'onmic' }, `${o.judges?.name || 'Judges'}:`),
      el('h3', { class: 'decide-q' }, 'Who took it?'),
      ...corners.map((k, i) => el('button', { class: `btn big ${k.color}`, onClick: () => win(o, i) }, k.name)),
      settings.get('crowdMeter')
        ? el('button', { class: 'btn', onClick: () => crowd(o) }, icon('mic', 18), 'Crowd meter')
        : null);
  }
  return c;
}

function dropButton(o) {
  let armed = false, timer = 0;
  const label = el('span', {}, 'Mic drop');
  const b = el('button', {
    class: 'btn drop', title: 'A bar so cold it ends the bout: instant win, double points',
    onClick: () => {
      if (!armed) {
        armed = true;
        b.classList.add('armed');
        label.textContent = 'Sure? Tap again';
        timer = setTimeout(() => { armed = false; b.classList.remove('armed'); label.textContent = 'Mic drop'; }, 2500);
        return;
      }
      clearTimeout(timer);
      micDrop(o);
    },
  }, icon('mic', 18), label);
  return b;
}

// ---------- flow ----------
function startVerse(o, turn) {
  const { bout } = o;
  const total = bout.twist?.seconds || settings.get('roundSeconds');
  Object.assign(bout, { phase: 'verse', turn });
  bout.clock = { total, left: total, running: true, last: performance.now(), shown: total };
  sfx('bell');
  duck(1);
  if (settings.get('autoBeat') && !isPlaying()) {
    const t = pickNext() || mixer.queue[0];
    if (t) playTrack(t).catch(() => {});
  }
  o.rerender();
}

function toggleClock(o) {
  const ck = o.bout.clock;
  ck.running = !ck.running;
  ck.last = performance.now();
  o.rerender();
}

function endVerse(o) {
  const { bout } = o;
  if (bout.phase !== 'verse') return;
  bout.clock = null;
  if (bout.turn === 0) bout.phase = 'handoff';
  else { bout.phase = 'decide'; duck(0.35); }
  stagefx.calm();
  o.rerender();
}

function micDrop(o) {
  const { bout, order, corners } = o;
  if (bout.pending) return;
  bout.pending = true;
  const idx = order[bout.turn];
  bout.clock = null;
  sfx('boom');
  stamp('Mic drop!', corners[idx].color, 1900);
  stagefx.flare(2800);
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 700);
  setTimeout(() => finish(o, idx, true), 1700);
}

function win(o, idx) {
  if (o.bout.pending) return;
  o.bout.pending = true;
  sfx('win');
  sfx('applause');
  stamp(`${o.corners[idx].name} takes it`, o.corners[idx].color, 1500);
  stagefx.flare(1600);
  setTimeout(() => finish(o, idx, false), 1200);
}

function finish(o, idx, drop) {
  duck(1);
  stagefx.calm();
  live = null;
  o.onDecide(idx, drop);
}

async function crowd(o) {
  const res = await crowdVote(o.corners.map((c) => ({ name: c.name, color: c.color })));
  if (res && res.winner != null) win(o, res.winner);
  else toast('Judges, make the call.');
}

function soundboard() {
  const pad = (ic, label, fn) => el('button', { class: 'pad', onClick: fn }, icon(ic, 22), el('span', {}, label));
  return el('div', { class: 'soundboard', 'aria-label': 'Soundboard' },
    el('span', { class: 'sb-label' }, 'Soundboard'),
    pad('horn', 'Air horn', () => sfx('airhorn')),
    pad('clap', 'Applause', () => sfx('applause')),
    pad('bell', 'Bell', () => sfx('bell')),
    pad('rewind', 'Pull up', () => { if (!pullUp()) toast('No beat playing to pull up.'); }),
    pad('next', 'Next beat', () => {
      const t = pickNext() || mixer.queue[0];
      if (t) playTrack(t).catch(() => toast('Couldn’t load that beat.'));
      else toast('No beats in the player yet.');
    }));
}

// ---------- the clock ----------
setInterval(() => {
  const b = live?.bout;
  const ck = b?.clock;
  if (!ck || !ck.running || b.phase !== 'verse' || !document.querySelector('.bout')) return;
  const now = performance.now();
  ck.left = Math.max(0, ck.left - (now - ck.last) / 1000);
  ck.last = now;
  const sec = Math.ceil(ck.left);
  if (sec < ck.shown) {
    ck.shown = sec;
    if (sec <= 5 && sec > 0) sfx('tick');
  }
  const digits = document.querySelector('.clock-digits');
  if (digits) digits.textContent = fmt(sec);
  const fill = document.querySelector('.clock-fill');
  if (fill) fill.style.width = `${(ck.left / ck.total) * 100}%`;
  document.querySelector('.clock')?.classList.toggle('warn', sec <= 10);
  stagefx.heat(0.4 + 0.55 * (1 - ck.left / ck.total));
  if (ck.left <= 0) {
    ck.running = false;
    sfx('horn');
    stamp('Time!', 'ink');
    const o = live.o;
    setTimeout(() => { if (live?.bout === b && b.phase === 'verse') endVerse(o); }, 1300);
  }
}, 100);

// Space bar: ring the bell / pause the clock.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || !live || !document.querySelector('.bout')) return;
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName)) return;
  const { bout, o } = live;
  if (bout.phase === 'draw') startVerse(o, 0);
  else if (bout.phase === 'handoff') startVerse(o, 1);
  else if (bout.phase === 'verse') toggleClock(o);
  else return;
  e.preventDefault();
});

// ---------- results ----------
export function renderPodium({ kicker, champ, title, rows, note, actions }) {
  return el('section', { class: 'podium' },
    el('div', { class: `podium-hero ${champ.color || 'gold'}` },
      el('div', { class: 'burst', 'aria-hidden': 'true' }),
      el('div', { class: 'belt' },
        el('p', { class: 'kicker' }, kicker),
        el('h2', { class: 'podium-name' }, champ.name),
        el('p', { class: 'podium-line' }, champ.line))),
    el('div', { class: 'standings panel' },
      el('h3', { class: 'panel-title' }, title),
      el('ol', {}, ...rows.map((r) => el('li', { class: r.color || '' },
        el('span', { class: 'st-name' }, r.name),
        el('span', { class: 'st-val' }, r.value)))),
      note ? el('p', { class: 'fine' }, note) : null),
    el('div', { class: 'btnrow center' },
      ...actions.map((a) => el('button', { class: `btn ${a.cls || ''}`, onClick: a.onClick }, a.label))));
}
