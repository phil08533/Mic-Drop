// King of the Hill: everyone's in one line. Two step up, the room picks the
// winner, the winner keeps the crown and the loser goes to the back of the line.
// The longer the king's streak, the hotter the fire.

import { el, clear, ask, toast, stamp, shuffle } from './ui.js';
import { icon } from './icons.js';
import { settings, game } from './state.js';
import { drawHandKoth, maybeTwist } from './cards.js';
import { newBout, renderBout, renderPodium } from './bout.js';
import { stagefx } from './stagefx.js';
import { sfx } from './sfx.js';

function newKothState() {
  return { roster: [], nextId: 1, started: false };
}

const byId = (s, id) => s.roster.find((p) => p.id === id);

function addPlayer(s, name) {
  const p = { id: s.nextId++, name, wins: 0, drops: 0, streak: 0, best: 0 };
  s.roster.push(p);
  return p;
}

// ====== SETUP ======
export function renderKothSetup({ go }) {
  if (!game.koth) game.koth = newKothState();
  const s = game.koth;
  stagefx.base(0.3);

  const root = el('section', { class: 'setup' });
  root.appendChild(el('header', { class: 'screen-head' },
    el('p', { class: 'kicker' }, 'Open cypher · King of the Hill'),
    el('h2', { class: 'screen-title' }, 'Who’s in the ', el('em', {}, 'cypher?')),
    el('p', { class: 'lede' },
      'Add everybody who wants a turn. Two step up, the room picks a winner. ',
      'Winner keeps the crown, loser goes to the back of the line.')));

  const input = el('input', { class: 'input', placeholder: 'Rapper name', maxlength: 22, 'aria-label': 'Rapper name' });
  const add = () => {
    const name = input.value.trim();
    if (!name) return;
    addPlayer(s, name);
    input.value = '';
    draw();
    input.focus();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  root.appendChild(el('div', { class: 'add-row' }, input, el('button', { class: 'btn ink', onClick: add }, icon('plus', 16), 'Add')));

  const list = el('div', { class: 'roster panel' });
  const draw = () => {
    clear(list);
    list.appendChild(el('h3', { class: 'panel-title' }, `In the line (${s.roster.length})`));
    if (!s.roster.length) {
      list.appendChild(el('p', { class: 'fine' }, 'Nobody yet. You need at least two.'));
      return;
    }
    list.appendChild(el('div', { class: 'chips' }, ...s.roster.map((p) => el('span', { class: 'chip' },
      p.name,
      el('button', { class: 'chip-x', 'aria-label': `Remove ${p.name}`, onClick: () => {
        s.roster = s.roster.filter((x) => x.id !== p.id);
        draw();
      } }, icon('close', 12))))));
  };
  draw();
  root.appendChild(list);

  const err = el('p', { class: 'form-error', role: 'alert' });
  root.appendChild(err);
  root.appendChild(el('div', { class: 'btnrow' },
    el('button', { class: 'btn ink big', onClick: () => {
      if (s.roster.length < 2) { err.textContent = 'Add at least two rappers.'; return; }
      start(s);
      go('koth-battle');
    } }, icon('crown', 20), 'Start the cypher'),
    el('button', { class: 'btn', onClick: async () => {
      if (await ask('Clear the whole line?', { ok: 'Clear', danger: true })) { game.koth = newKothState(); go('koth-setup', { replace: true }); }
    } }, 'Reset')));
  return root;
}

function start(s) {
  for (const p of s.roster) Object.assign(p, { wins: 0, drops: 0, streak: 0, best: 0 });
  const ids = shuffle(s.roster.map((p) => p.id));
  Object.assign(s, { started: true, king: ids[0], challenger: ids[1], line: ids.slice(2), bout: null, hands: null, boutNo: 1 });
}

// ====== BATTLE ======
export function renderKothBattle({ go }) {
  const s = game.koth;
  if (!s?.started) { go('koth-setup', { replace: true }); return el('div'); }
  const king = byId(s, s.king), ch = byId(s, s.challenger);
  if (!king || !ch) { s.started = false; go('koth-setup', { replace: true }); return el('div'); }
  stagefx.base(Math.min(0.75, 0.32 + king.streak * 0.1));
  if (!s.bout) {
    s.bout = newBout(settings.get('twists') ? maybeTwist() : null);
    s.hands = [drawHandKoth(), drawHandKoth()];
  }
  const rerender = () => go('koth-battle', { replace: true });

  const root = el('section', { class: 'battle' });
  root.appendChild(renderBout({
    bout: s.bout,
    corners: [
      { name: king.name, color: 'gold', tag: 'The King', crown: true, hand: s.hands[0],
        sub: king.streak ? `${king.streak} win${king.streak === 1 ? '' : 's'} in a row${king.streak >= 3 ? ' · on fire' : ''}` : 'Just took the hill' },
      { name: ch.name, color: 'blue', tag: 'Challenger', hand: s.hands[1], sub: ch.wins ? `${ch.wins} win${ch.wins === 1 ? '' : 's'} tonight` : 'Fresh legs' },
    ],
    order: [1, 0],                                           // challenger opens, the king answers
    head: { kicker: `Bout ${s.boutNo}`, title: `${ch.name} wants the crown` },
    judges: { label: 'Judging', name: 'The whole room' },
    onDecide: (idx, drop) => decide(s, idx === 0 ? king : ch, idx === 0 ? ch : king, drop, go),
    rerender,
  }));

  // the line + add on the fly
  const input = el('input', { class: 'input', placeholder: 'Jump in: add a rapper', maxlength: 22, 'aria-label': 'Add a rapper to the line' });
  const add = () => {
    const name = input.value.trim();
    if (!name) return;
    s.line.push(addPlayer(s, name).id);
    rerender();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const line = el('div', { class: 'panel line' },
    el('h3', { class: 'panel-title' }, 'Up next'),
    s.line.length
      ? el('ol', { class: 'chips queue' }, ...s.line.map((id, i) => {
        const p = byId(s, id);
        return el('li', { class: 'chip' + (i === 0 ? ' next' : '') },
          el('button', { class: 'chip-main', title: i ? 'Bring them up next' : 'Next up', onClick: () => {
            if (!i) return;
            s.line.splice(i, 1);
            s.line.unshift(id);
            toast(`${p.name} is up next.`);
            rerender();
          } }, p.name),
          el('button', { class: 'chip-x', 'aria-label': `Take ${p.name} out of the line`, onClick: () => { s.line.splice(i, 1); rerender(); } }, icon('close', 12)));
      }))
      : el('p', { class: 'fine' }, 'Nobody waiting. The loser of this bout goes next.'),
    el('div', { class: 'add-row' }, input, el('button', { class: 'btn', onClick: add }, icon('plus', 16), 'Add')),
    el('p', { class: 'fine' }, 'Tap a name to bring them up next.'));

  const ranked = s.roster.slice().sort((a, b) => b.best - a.best || b.wins - a.wins);
  const board = el('div', { class: 'panel board' },
    el('h3', { class: 'panel-title' }, 'Leaderboard'),
    el('ol', { class: 'ranks' }, ...ranked.map((p) => el('li', {},
      el('span', { class: 'rank-name' }, p.id === s.king ? icon('crown', 16) : null, p.name),
      el('span', { class: 'rank-val' }, `best ${p.best} · ${p.wins} W`)))));

  root.appendChild(el('div', { class: 'two-col' }, line, board));
  root.appendChild(el('div', { class: 'btnrow' },
    el('button', { class: 'btn small', onClick: async () => {
      if (await ask('End the cypher and crown the champ?', { ok: 'End it' })) go('koth-results');
    } }, 'End the cypher')));
  return root;
}

function decide(s, winner, loser, drop, go) {
  winner.wins += 1;
  if (drop) winner.drops += 1;
  if (winner.id === s.king) {
    winner.streak += 1;
  } else {
    loser.streak = 0;
    s.king = winner.id;
    winner.streak = 1;
  }
  winner.best = Math.max(winner.best, winner.streak);
  s.line.push(loser.id);
  s.challenger = s.line.shift();
  s.bout = null; s.hands = null; s.boutNo += 1;
  if (winner.streak === 3) setTimeout(() => { stamp('On fire!', 'gold', 1500); sfx('airhorn'); }, 300);
  go('koth-battle', { replace: true });
}

// ====== RESULTS ======
export function renderKothResults({ go }) {
  const s = game.koth;
  if (!s?.started) { go('home', { replace: true }); return el('div'); }
  const ranked = s.roster.slice().sort((a, b) => b.best - a.best || b.wins - a.wins);
  const champ = ranked[0];
  stagefx.base(0.5);
  stagefx.flare(3000);
  sfx('applause');
  return renderPodium({
    kicker: 'King of the Hill',
    champ: { name: champ.name, color: 'gold', line: `${champ.best} in a row · ${champ.wins} win${champ.wins === 1 ? '' : 's'}${champ.drops ? ` · ${champ.drops} mic drop${champ.drops === 1 ? '' : 's'}` : ''}` },
    title: 'Leaderboard',
    rows: ranked.map((p) => ({ name: p.name, value: `best ${p.best} · ${p.wins} W` })),
    actions: [
      { label: 'Run it back', cls: 'ink big', onClick: () => { start(s); go('koth-battle'); } },
      { label: 'Edit the line', onClick: () => { s.started = false; go('koth-setup'); } },
      { label: 'Home', onClick: () => { game.koth = null; go('home'); } },
    ],
  });
}
