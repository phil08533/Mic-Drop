// Crew Battle: 2 or 3 crews. With three, two crews trade bars one-on-one while
// the third judges, and the roles rotate so every crew battles twice and judges
// once. With two, the whole room judges. A bout win is 1 point, a mic drop 2.

import { el, clear, ask, shuffle } from './ui.js';
import { icon } from './icons.js';
import { settings, game } from './state.js';
import { drawHandCrew, maybeTwist } from './cards.js';
import { newBout, renderBout, renderPodium } from './bout.js';
import { stagefx } from './stagefx.js';
import { sfx } from './sfx.js';

const COLORS = ['red', 'blue', 'gold'];
const NAMES = ['Red Crew', 'Blue Crew', 'Gold Crew'];

function newCrewState() {
  return {
    count: 3,
    teams: [0, 1, 2].map((i) => ({
      name: NAMES[i], color: COLORS[i],
      players: [{ name: '', age: '' }, { name: '', age: '' }],
      score: 0, drops: 0,
    })),
    started: false,
  };
}

const active = (s) => s.teams.slice(0, s.count);

// ====== SETUP ======
export function renderCrewSetup({ go }) {
  if (!game.crew) game.crew = newCrewState();
  const s = game.crew;
  stagefx.base(0.3);

  const root = el('section', { class: 'setup' });
  root.appendChild(el('header', { class: 'screen-head' },
    el('p', { class: 'kicker' }, 'Main event · Crew Battle'),
    el('h2', { class: 'screen-title' }, 'Pick your ', el('em', {}, 'crews.')),
    el('p', { class: 'lede' },
      'Crews trade bars one rapper at a time. With three crews, the crew sitting out judges and everybody rotates. ',
      'Ages are optional: the oldest crew goes first, or we flip a coin.')));

  const seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Number of crews' },
    ...[2, 3].map((n) => el('button', {
      class: s.count === n ? 'on' : '', role: 'radio', 'aria-checked': String(s.count === n),
      onClick: () => { s.count = n; go('crew-setup', { replace: true }); },
    }, `${n} crews`)));
  root.appendChild(seg);

  const grid = el('div', { class: `team-grid n${s.count}` });
  active(s).forEach((team) => grid.appendChild(teamCard(team)));
  root.appendChild(grid);

  const err = el('p', { class: 'form-error', role: 'alert' });
  root.appendChild(err);
  root.appendChild(el('div', { class: 'btnrow' },
    el('button', { class: 'btn ink big', onClick: () => {
      const problem = validate(s);
      if (problem) { err.textContent = problem; return; }
      startBattle(s);
      go('crew-battle');
    } }, icon('mic', 20), 'Start the battle'),
    el('button', { class: 'btn', onClick: async () => {
      if (await ask('Clear all crews and players?', { ok: 'Clear', danger: true })) {
        game.crew = newCrewState();
        go('crew-setup', { replace: true });
      }
    } }, 'Reset')));
  return root;
}

function teamCard(team) {
  const card = el('article', { class: `team-card ${team.color}` });
  card.appendChild(el('div', { class: 'plate' },
    el('input', {
      class: 'plate-input', value: team.name, maxlength: 22, 'aria-label': 'Crew name',
      onInput: (e) => { team.name = e.target.value; },
    })));
  const list = el('div', { class: 'players' });
  const meta = el('p', { class: 'fine' });
  const updateMeta = () => {
    const ages = team.players.map((p) => parseInt(p.age, 10)).filter((a) => a > 0);
    meta.textContent = `${team.players.length} rapper${team.players.length === 1 ? '' : 's'}` +
      (ages.length ? ` · combined age ${ages.reduce((a, b) => a + b, 0)}` : '');
  };
  const draw = () => {
    clear(list);
    team.players.forEach((p, i) => {
      list.appendChild(el('div', { class: 'player-row' },
        el('input', {
          class: 'input', placeholder: `Rapper ${i + 1}`, value: p.name, maxlength: 22, 'aria-label': `Rapper ${i + 1} name`,
          onInput: (e) => { p.name = e.target.value; },
        }),
        el('input', {
          class: 'input age', placeholder: 'Age', type: 'number', min: 1, max: 120, value: p.age, inputmode: 'numeric',
          'aria-label': `Rapper ${i + 1} age (optional)`,
          onInput: (e) => { p.age = e.target.value; updateMeta(); },
        }),
        el('button', {
          class: 'btn icon', 'aria-label': `Remove rapper ${i + 1}`, disabled: team.players.length <= 1,
          onClick: () => { team.players.splice(i, 1); draw(); },
        }, icon('close', 16))));
    });
    updateMeta();
  };
  draw();
  card.append(list,
    el('button', { class: 'btn small', onClick: () => { team.players.push({ name: '', age: '' }); draw(); list.lastChild?.querySelector('input')?.focus(); } },
      icon('plus', 14), 'Add rapper'),
    meta);
  return card;
}

function validate(s) {
  for (const t of active(s)) {
    if (!t.name.trim()) return 'Every crew needs a name.';
    if (!t.players.length) return `${t.name} needs at least one rapper.`;
  }
  return null;
}

function startBattle(s) {
  const teams = active(s);
  teams.forEach((t, ti) => {
    t.name = t.name.trim();
    t.score = 0; t.drops = 0;
    t.players.forEach((p, i) => { p.name = p.name.trim() || `${t.name.split(' ')[0]} ${i + 1}`; });
    t.index = ti;
  });
  const sums = teams.map((t) => t.players.reduce((a, p) => a + (parseInt(p.age, 10) || 0), 0));
  const start = Math.max(...sums) > 0 ? sums.indexOf(Math.max(...sums)) : shuffle(teams.map((_, i) => i))[0];
  // Each round, a crew battles the crew to its right and the crew to its left judges.
  s.rotation = s.count === 3
    ? [0, 1, 2].map((k) => ({ left: (start + k) % 3, right: (start + k + 1) % 3, judge: (start + k + 2) % 3 }))
    : [{ left: start, right: 1 - start, judge: null }];
  Object.assign(s, { started: true, roundIndex: 0, pairIndex: 0, bout: null, hands: null, sudden: false, mvp: {} });
}

const pairsIn = (s, round) => (s.sudden ? 1
  : Math.max(s.teams[round.left].players.length, s.teams[round.right].players.length));

// ====== BATTLE ======
export function renderCrewBattle({ go }) {
  const s = game.crew;
  if (!s?.started) { go('crew-setup', { replace: true }); return el('div'); }
  if (s.roundIndex >= s.rotation.length) { go('crew-results', { replace: true }); return el('div'); }
  stagefx.base(0.35);

  const round = s.rotation[s.roundIndex];
  const L = s.teams[round.left], R = s.teams[round.right];
  const J = round.judge != null ? s.teams[round.judge] : null;
  const pairs = pairsIn(s, round);
  const lp = L.players[s.pairIndex % L.players.length];
  const rp = R.players[s.pairIndex % R.players.length];
  if (!s.bout) {
    s.bout = newBout(settings.get('twists') ? maybeTwist() : null);
    s.hands = [drawHandCrew(), drawHandCrew()];
  }

  const root = el('section', { class: 'battle' });
  root.appendChild(scoreboard(s, round));
  root.appendChild(renderBout({
    bout: s.bout,
    corners: [
      { name: lp.name, color: L.color, tag: L.name, hand: s.hands[0] },
      { name: rp.name, color: R.color, tag: R.name, hand: s.hands[1] },
    ],
    order: [0, 1],
    head: {
      kicker: s.sudden ? 'Sudden death' : `Round ${s.roundIndex + 1} of ${s.rotation.length}`,
      title: `${L.name} vs ${R.name} · bout ${s.pairIndex + 1} of ${pairs}`,
    },
    judges: J ? { label: 'Judging', name: J.name, color: J.color } : { label: 'Judging', name: 'The whole room' },
    onDecide: (idx, drop) => award(s, idx === 0 ? round.left : round.right, idx === 0 ? lp : rp, drop, go),
    rerender: () => go('crew-battle', { replace: true }),
  }));
  root.appendChild(el('div', { class: 'btnrow' },
    el('button', { class: 'btn small', onClick: async () => {
      if (await ask('Go back and edit the crews? Scores reset.', { ok: 'Edit crews' })) { s.started = false; go('crew-setup'); }
    } }, 'Edit crews'),
    el('button', { class: 'btn small', onClick: async () => {
      if (await ask('End this battle?', { ok: 'End it', danger: true })) { game.crew = null; go('home'); }
    } }, 'Quit')));
  return root;
}

function scoreboard(s, round) {
  return el('div', { class: 'scoreboard', 'aria-label': 'Score' },
    ...active(s).map((t, i) => el('div', {
      class: `score ${t.color}${i === round.judge ? ' judging' : ''}`,
    },
    el('span', { class: 'score-name' }, t.name),
    el('span', { class: 'score-pts' }, String(t.score)),
    el('span', { class: 'score-role' }, i === round.judge ? 'Judging' : 'Battling'))));
}

function award(s, teamIdx, player, drop, go) {
  const t = s.teams[teamIdx];
  t.score += drop ? 2 : 1;
  if (drop) t.drops += 1;
  const key = `${teamIdx}|${player.name}`;
  s.mvp[key] = (s.mvp[key] || 0) + (drop ? 2 : 1);

  s.bout = null; s.hands = null;
  const pairs = pairsIn(s, s.rotation[s.roundIndex]);
  s.pairIndex += 1;
  if (s.pairIndex >= pairs) { s.pairIndex = 0; s.roundIndex += 1; }
  if (s.roundIndex >= s.rotation.length) { go('crew-results'); return; }
  go('crew-battle', { replace: true });
}

// ====== RESULTS ======
export function renderCrewResults({ go }) {
  const s = game.crew;
  if (!s?.started) { go('home', { replace: true }); return el('div'); }
  const ranked = active(s).map((t, i) => ({ ...t, i })).sort((a, b) => b.score - a.score || b.drops - a.drops);
  const top = ranked[0];
  const tied = ranked.filter((t) => t.score === top.score && t.drops === top.drops);
  const [mvpKey, mvpPts] = Object.entries(s.mvp || {}).sort((a, b) => b[1] - a[1])[0] || [];
  const mvp = mvpKey ? { name: mvpKey.split('|')[1], team: s.teams[+mvpKey.split('|')[0]].name } : null;
  stagefx.base(0.5);
  stagefx.flare(3000);
  sfx('applause');

  const rows = ranked.map((t) => ({ name: t.name, color: t.color, value: `${t.score} pt${t.score === 1 ? '' : 's'}${t.drops ? ` · ${t.drops} drop${t.drops === 1 ? '' : 's'}` : ''}` }));
  const again = () => { startBattle(s); go('crew-battle'); };

  if (tied.length > 1) {
    return renderPodium({
      kicker: 'Dead even',
      champ: { name: 'It’s a tie', color: 'gold', line: `${tied.map((t) => t.name).join(' and ')} are level. Settle it with one bout.` },
      title: 'Standings', rows,
      actions: [
        { label: 'Sudden death', cls: 'ink big', onClick: () => {
          const third = active(s).findIndex((_, i) => i !== tied[0].i && i !== tied[1].i);
          s.rotation = [{ left: tied[0].i, right: tied[1].i, judge: third >= 0 ? third : null }];
          Object.assign(s, { roundIndex: 0, pairIndex: 0, sudden: true, bout: null, hands: null });
          go('crew-battle');
        } },
        { label: 'Call it a draw', onClick: () => { game.crew = null; go('home'); } },
      ],
    });
  }

  return renderPodium({
    kicker: 'Champions',
    champ: { name: top.name, color: top.color, line: `${top.players.map((p) => p.name).join(' · ')}` },
    title: 'Final standings', rows,
    note: mvp ? `MVP: ${mvp.name} (${mvp.team}), ${mvpPts} point${mvpPts === 1 ? '' : 's'}.` : null,
    actions: [
      { label: 'Run it back', cls: 'ink big', onClick: again },
      { label: 'New crews', onClick: () => { s.started = false; go('crew-setup'); } },
      { label: 'Home', onClick: () => { game.crew = null; go('home'); } },
    ],
  });
}
