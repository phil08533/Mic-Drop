// Crew Battle: 3 teams, oldest combined age starts vs the team to their right,
// the team to their left judges. Players go one-on-one down the lineup.

import { el, clear, sleep, sfx } from './ui.js';
import { settings, game } from './state.js';
import { drawHandCrew } from './cards.js';

const TEAM_COLORS = ['#ff4d2e', '#ffb03a', '#b73fff'];
const TEAM_DEFAULT_NAMES = ['Crew Alpha', 'Crew Bravo', 'Crew Charlie'];

function newCrewState() {
  return {
    teams: [0, 1, 2].map((i) => ({
      id: i,
      name: TEAM_DEFAULT_NAMES[i],
      color: TEAM_COLORS[i],
      players: [
        { name: '', age: '' },
        { name: '', age: '' },
      ],
      score: 0,
    })),
    started: false,
    // Battle state
    rotation: [],         // [{leftIdx, rightIdx, judgeIdx}]
    roundIndex: 0,
    pairIndex: 0,         // which pair within the round
    cards: { left: null, right: null },  // currently revealed cards
    revealed: { left: false, right: false },
    timer: null,          // {remaining, running}
  };
}

// ====== SETUP SCREEN ======
export function renderCrewSetup({ go }) {
  if (!game.crew) game.crew = newCrewState();
  const s = game.crew;

  const root = el('section', { class: 'setup' });

  root.appendChild(el('h2', { class: 'screen-title' }, 'Set up the ', el('em', {}, 'crews.')));
  root.appendChild(el('p', { class: 'screen-sub' },
    'Three teams. Drop in names + rough ages. Highest combined age battles first; the team to their left judges.'));

  const grid = el('div', { class: 'team-grid' });

  s.teams.forEach((team, idx) => {
    const card = el('article', { class: 'team-card' });

    const head = el('h3', {},
      el('span', { class: 'swatch', style: { background: team.color } }),
      el('span', {}, `Team ${idx + 1}`),
    );
    card.appendChild(head);

    const nameInput = el('input', {
      class: 'input name-input', value: team.name, maxlength: 24,
      onInput: (e) => { team.name = e.target.value; },
    });
    card.appendChild(nameInput);

    const playersWrap = el('div', { class: 'players' });
    const renderPlayers = () => {
      clear(playersWrap);
      team.players.forEach((p, i) => {
        const row = el('div', { class: 'player-row' },
          el('input', {
            class: 'input', placeholder: `Player ${i + 1} name`, value: p.name, maxlength: 22,
            onInput: (e) => { p.name = e.target.value; updateMeta(); },
          }),
          el('input', {
            class: 'input age', placeholder: 'age', type: 'number', min: 1, max: 120, value: p.age,
            onInput: (e) => { p.age = e.target.value; updateMeta(); },
          }),
          el('button', { class: 'removebtn', 'aria-label': `Remove player ${i + 1}`, onClick: () => {
            if (team.players.length <= 1) return;
            team.players.splice(i, 1); renderPlayers(); updateMeta();
          } }, '×'),
        );
        playersWrap.appendChild(row);
      });
    };
    renderPlayers();
    card.appendChild(playersWrap);

    const addBtn = el('button', { class: 'btn add-player', onClick: () => {
      team.players.push({ name: '', age: '' }); renderPlayers(); updateMeta();
    } }, '+ Add player');
    card.appendChild(addBtn);

    const meta = el('div', { class: 'team-meta' });
    function updateMeta() {
      const total = team.players.reduce((a, p) => a + (parseInt(p.age, 10) || 0), 0);
      meta.textContent = `${team.players.length} player${team.players.length === 1 ? '' : 's'} · combined age ${total}`;
    }
    updateMeta();
    card.appendChild(meta);

    grid.appendChild(card);
  });

  root.appendChild(grid);

  const controls = el('div', { class: 'btnrow' });

  controls.appendChild(el('button', { class: 'primarybtn', onClick: () => {
    const ok = validate(s);
    if (ok !== true) { alert(ok); return; }
    startBattle(s);
    go('crew-battle');
  } }, '🎤 Start the battle'));

  controls.appendChild(el('button', { class: 'ghostbtn', onClick: () => {
    if (confirm('Clear setup?')) { game.crew = newCrewState(); go('crew-setup', { replace: true }); }
  } }, 'Reset'));

  root.appendChild(controls);
  return root;
}

function validate(s) {
  for (const t of s.teams) {
    if (!t.name.trim()) return `Give every team a name.`;
    if (t.players.length === 0) return `${t.name} has no players.`;
    for (const p of t.players) {
      if (!p.name.trim()) return `${t.name}: every player needs a name.`;
      const a = parseInt(p.age, 10);
      if (!Number.isFinite(a) || a < 1) return `${t.name}: every player needs an age (so we can pick who starts).`;
    }
  }
  // For balanced one-on-ones, the two battling teams should have the same
  // count — but we'll just round down to the smaller count when battling,
  // so this is a soft warning only.
  return true;
}

function startBattle(s) {
  // Sort teams by combined age descending; that gives us "first to mic".
  const sums = s.teams.map((t, i) => ({
    i, sum: t.players.reduce((a, p) => a + (parseInt(p.age, 10) || 0), 0),
  }));
  sums.sort((a, b) => b.sum - a.sum);
  const startIdx = sums[0].i;

  // Three-team rotation: each round, one team battles the team to their
  // RIGHT, with the team to their LEFT judging. Rotate clockwise.
  // Rounds:
  //   Round 1: start vs (start+1) mod 3, judge = (start-1) mod 3
  //   Round 2: (start+1) vs (start+2), judge = start
  //   Round 3: (start+2) vs start,     judge = (start+1)
  s.rotation = [];
  for (let k = 0; k < 3; k++) {
    const left = (startIdx + k) % 3;
    const right = (startIdx + k + 1) % 3;
    const judge = (startIdx + k - 1 + 3) % 3;
    s.rotation.push({ leftIdx: left, rightIdx: right, judgeIdx: judge });
  }
  s.roundIndex = 0;
  s.pairIndex = 0;
  s.started = true;
  s.cards = { left: null, right: null };
  s.revealed = { left: false, right: false };
  s.timer = null;
}

// ====== BATTLE SCREEN ======
export function renderCrewBattle({ go }) {
  if (!game.crew?.started) { go('crew-setup', { replace: true }); return el('div'); }
  const s = game.crew;

  const round = s.rotation[s.roundIndex];
  const left = s.teams[round.leftIdx];
  const right = s.teams[round.rightIdx];
  const judge = s.teams[round.judgeIdx];
  const pairCount = Math.min(left.players.length, right.players.length);
  const lp = left.players[s.pairIndex % left.players.length];
  const rp = right.players[s.pairIndex % right.players.length];

  const root = el('section', { class: 'battle' });

  // Header: round + score
  const header = el('div', { class: 'battle-header' },
    sideCard(left,  s.pairIndex, 'left',  `Round ${s.roundIndex + 1} · battler`),
    el('div', { class: 'battle-vs' }, 'VS'),
    sideCard(right, s.pairIndex, 'right', `Round ${s.roundIndex + 1} · battler`),
  );
  root.appendChild(header);

  // Judges banner
  const judges = el('div', { class: 'judges-banner' },
    el('span', { class: 'label' }, 'Judges'),
    el('strong', { style: { color: judge.color } }, judge.name),
    el('span', { class: 'note' }, `(team to ${left.name}'s left)`),
  );
  root.appendChild(judges);

  // Stage with the matchup + cards + actions
  const stage = el('div', { class: 'stage' });

  const matchup = el('div', { class: 'matchup' },
    el('div', { class: 'who', style: { color: left.color, textAlign: 'right' } }, lp.name),
    el('div', { class: 'vs' }, 'vs'),
    el('div', { class: 'who', style: { color: right.color } }, rp.name),
  );
  stage.appendChild(matchup);

  // Cards: each player gets a hand of [prompt, rhyme]
  const cards = el('div', { class: 'cards' });

  const leftHand = ensureHand(s, 'left');
  const rightHand = ensureHand(s, 'right');

  cards.appendChild(handBlock(leftHand, lp.name, left.color, 'left', () => window.MicDrop.go('crew-battle', { replace: true })));
  cards.appendChild(handBlock(rightHand, rp.name, right.color, 'right', () => window.MicDrop.go('crew-battle', { replace: true })));

  stage.appendChild(cards);

  // Timer + actions
  const timerWrap = el('div');
  timerWrap.appendChild(buildTimer(s, () => window.MicDrop.go('crew-battle', { replace: true })));
  stage.appendChild(timerWrap);

  const actions = el('div', { class: 'stage-actions' });

  // Score strip
  const score = el('div', { class: 'score-strip' });
  s.teams.forEach((t) => {
    const pip = el('span', { class: 'pip' + (t.score > 0 ? ' win' : ''), style: { borderColor: t.color } },
      `${t.name}: ${t.score}`);
    score.appendChild(pip);
  });
  actions.appendChild(score);

  const verdict = el('div', { class: 'verdict-actions' });
  verdict.appendChild(el('button', { class: 'primarybtn', onClick: () => awardWin(s, round.leftIdx, () => window.MicDrop.go('crew-battle', { replace: true })) },
    `${left.name} wins this bar`));
  verdict.appendChild(el('button', { class: 'primarybtn violet', onClick: () => awardWin(s, round.rightIdx, () => window.MicDrop.go('crew-battle', { replace: true })) },
    `${right.name} wins this bar`));
  actions.appendChild(verdict);

  stage.appendChild(actions);
  root.appendChild(stage);

  // Round nav
  const nav = el('div', { class: 'btnrow' },
    el('button', { class: 'ghostbtn', onClick: () => { game.crew = null; window.MicDrop.go('crew-setup'); } }, 'Edit teams'),
    el('button', { class: 'ghostbtn', onClick: () => { if (confirm('Quit this battle?')) { game.crew = null; window.MicDrop.go('home'); } } }, 'Quit'),
  );
  root.appendChild(nav);

  return root;
}

function sideCard(team, pairIdx, side, sub) {
  const card = el('div', { class: `battle-side ${side}`, style: { borderColor: team.color } });
  card.appendChild(el('div', { class: 'sub' }, sub));
  card.appendChild(el('h3', { style: { color: team.color } }, team.name));
  const ros = el('ol', { class: 'roster' });
  team.players.forEach((p, i) => {
    ros.appendChild(el('li', { class: i === pairIdx ? 'current' : '' }, p.name || `Player ${i + 1}`));
  });
  card.appendChild(ros);
  return card;
}

function ensureHand(s, side) {
  if (!s.cards[side]) s.cards[side] = drawHandCrew();
  return s.cards[side];
}

function handBlock(hand, who, color, side, rerender) {
  const wrap = el('div', { class: 'card-hand' });
  wrap.appendChild(el('div', { class: 'section-title', style: { color } }, who));
  const stack = el('div', { class: 'cards', style: { gridTemplateColumns: '1fr 1fr' } });
  hand.forEach((c, i) => stack.appendChild(cardElement(c, side, i, rerender)));
  wrap.appendChild(stack);
  return wrap;
}

function cardElement(card, side, slot, rerender) {
  const key = `${side}-${slot}`;
  const wrapper = el('div', { class: 'card-slot' });
  const known = card.__revealed;
  if (!known) {
    const back = el('button', { class: 'card face-down', onClick: () => {
      card.__revealed = true;
      sfxIfOn('flip');
      rerender();
    } }, el('div', { class: 'kind' }, card.kind === 'rhyme' ? 'Rhyme' : 'Prompt'),
      el('div', { class: 'body' }, 'Tap to draw'));
    wrapper.appendChild(back);
  } else {
    wrapper.appendChild(faceUp(card));
  }
  return wrapper;
}

function faceUp(card) {
  if (card.kind === 'rhyme') {
    const wrap = el('div', { class: 'card rhyme' });
    wrap.appendChild(el('div', { class: 'corner' }, 'Rhyme'));
    wrap.appendChild(el('div', { class: 'kind' }, 'Land a rhyme on'));
    wrap.appendChild(el('div', { class: 'body' }, card.anchor));
    if (settings.get('showRhymeHint')) {
      const list = el('div', { class: 'rhyme-list' });
      card.words.slice(0, 6).forEach((w) => list.appendChild(el('span', { class: 'word' }, w)));
      wrap.appendChild(list);
    }
    return wrap;
  }
  const cls = card.kind === 'burn' ? 'burn' : 'boast';
  const wrap = el('div', { class: `card ${cls}` });
  wrap.appendChild(el('div', { class: 'corner' }, card.kind === 'burn' ? 'Burn' : 'Boast'));
  wrap.appendChild(el('div', { class: 'kind' }, card.kind === 'burn' ? 'Roast prompt' : 'Hype prompt'));
  wrap.appendChild(el('div', { class: 'body' }, card.text));
  return wrap;
}

function buildTimer(s, rerender) {
  const total = settings.get('roundSeconds');
  if (!s.timer) s.timer = { remaining: total, running: false, started: false };
  const t = s.timer;

  const display = el('div', { class: 'timer' }, formatTime(t.remaining));
  if (t.remaining <= 10) display.classList.add('warn');
  if (t.remaining <= 0)  display.classList.add('zero');

  const row = el('div', { class: 'timer-row' });
  row.appendChild(el('button', { class: 'btn', onClick: () => {
    if (t.remaining <= 0) t.remaining = total;
    t.running = !t.running;
    if (t.running) startCountdown(s, display, rerender);
  } }, t.running ? 'Pause' : (t.started ? 'Resume' : 'Start timer')));
  row.appendChild(el('button', { class: 'btn', onClick: () => {
    t.running = false; t.remaining = total; t.started = false; rerender();
  } }, 'Reset'));

  return el('div', {}, display, row);
}

let _interval = null;
function startCountdown(s, _display, rerender) {
  if (_interval) clearInterval(_interval);
  s.timer.started = true;
  _interval = setInterval(() => {
    if (!s.timer || !s.timer.running) { clearInterval(_interval); _interval = null; return; }
    // Query the live timer element each tick — rerenders orphan stale refs.
    const live = document.querySelector('.timer');
    if (!live) { clearInterval(_interval); _interval = null; s.timer.running = false; return; }
    s.timer.remaining = Math.max(0, s.timer.remaining - 1);
    if (live) {
      live.textContent = formatTime(s.timer.remaining);
      live.classList.toggle('warn', s.timer.remaining <= 10 && s.timer.remaining > 0);
      live.classList.toggle('zero', s.timer.remaining <= 0);
    }
    if (s.timer.remaining <= 5 && s.timer.remaining > 0) sfxIfOn('tick');
    if (s.timer.remaining === 0) {
      s.timer.running = false;
      sfxIfOn('horn');
      clearInterval(_interval); _interval = null;
      rerender();
    }
  }, 1000);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sfxIfOn(kind) {
  if (!settings.get('sfxOn')) return;
  sfx(kind, { volume: settings.get('sfxVolume') });
}

function awardWin(s, teamIdx, rerender) {
  s.teams[teamIdx].score += 1;
  sfxIfOn('win');
  // Advance to next pair, or next round.
  const round = s.rotation[s.roundIndex];
  const left = s.teams[round.leftIdx];
  const right = s.teams[round.rightIdx];
  const pairCount = Math.min(left.players.length, right.players.length);

  s.cards = { left: null, right: null };
  s.timer = null;
  s.pairIndex += 1;

  if (s.pairIndex >= pairCount) {
    s.pairIndex = 0;
    s.roundIndex += 1;
    if (s.roundIndex >= s.rotation.length) {
      // game over
      showFinal(s);
      return;
    }
  }
  rerender();
}

function showFinal(s) {
  const winner = s.teams.slice().sort((a, b) => b.score - a.score)[0];
  setTimeout(() => {
    alert(`Battle done. ${winner.name} take it with ${winner.score} bars.`);
    game.crew = null;
    window.MicDrop.go('home');
  }, 100);
}
