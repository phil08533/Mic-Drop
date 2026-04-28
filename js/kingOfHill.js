// King of the Hill: roster of players, two on the mic, winner stays.
// Each up-player draws 3 cards (1 prompt + 2 rhymes).

import { el, clear, sfx } from './ui.js';
import { settings, game } from './state.js';
import { drawHandKoth } from './cards.js';

function newKothState() {
  return {
    roster: [],          // [{id, name, wins, reign, longestReign}]
    nextId: 1,
    // up-state
    king: null,          // current king's id
    challenger: null,    // current challenger's id
    hands: {},           // { id: [card, card, card] }
    started: false,
    timer: null,
  };
}

// ====== SETUP ======
export function renderKothSetup({ go }) {
  if (!game.koth) game.koth = newKothState();
  const s = game.koth;

  const root = el('section', { class: 'setup' });

  root.appendChild(el('h2', { class: 'screen-title' }, 'King of the ', el('em', {}, 'Hill.')));
  root.appendChild(el('p', { class: 'screen-sub' },
    'Add anyone who wants in. Two go up at a time, three cards each, winner stays. Anyone can jump in mid-game.'));

  // Add row
  const addRow = el('div', { class: 'add-row' });
  const input = el('input', { class: 'input', placeholder: 'Player name', maxlength: 22 });
  const addBtn = el('button', { class: 'primarybtn', onClick: () => {
    const name = input.value.trim();
    if (!name) return;
    s.roster.push({ id: s.nextId++, name, wins: 0, reign: 0, longestReign: 0 });
    input.value = '';
    renderRoster();
  } }, '+ Add');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtn.click(); });
  addRow.append(input, addBtn);
  root.appendChild(addRow);

  const rosterWrap = el('div', { class: 'leaderboard' });
  function renderRoster() {
    clear(rosterWrap);
    rosterWrap.appendChild(el('h4', {}, `Roster (${s.roster.length})`));
    if (!s.roster.length) {
      rosterWrap.appendChild(el('p', { class: 'note' }, 'Nobody on the bench yet. Add at least two players.'));
      return;
    }
    const ol = el('ol');
    s.roster.forEach((p) => {
      const li = el('li', {},
        el('strong', {}, p.name),
        ' ',
        el('button', {
          class: 'removebtn', style: { float: 'right' }, 'aria-label': `Remove ${p.name}`,
          onClick: () => {
            s.roster = s.roster.filter((x) => x.id !== p.id);
            if (s.king === p.id) s.king = null;
            if (s.challenger === p.id) s.challenger = null;
            renderRoster();
          },
        }, '×'),
      );
      ol.appendChild(li);
    });
    rosterWrap.appendChild(ol);
  }
  renderRoster();
  root.appendChild(rosterWrap);

  const controls = el('div', { class: 'btnrow' });
  controls.appendChild(el('button', { class: 'primarybtn violet', onClick: () => {
    if (s.roster.length < 2) { alert('Need at least two players to start.'); return; }
    startKoth(s);
    go('koth-battle');
  } }, '🎤 Start the cypher'));

  controls.appendChild(el('button', { class: 'ghostbtn', onClick: () => {
    if (confirm('Clear the roster?')) { game.koth = newKothState(); go('koth-setup', { replace: true }); }
  } }, 'Reset'));

  root.appendChild(controls);
  return root;
}

function pickRandomFrom(roster, exceptIds = []) {
  const pool = roster.filter((p) => !exceptIds.includes(p.id));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function startKoth(s) {
  const a = pickRandomFrom(s.roster);
  const b = pickRandomFrom(s.roster, [a.id]);
  s.king = a.id; s.challenger = b.id;
  s.hands = {};
  s.started = true;
}

// ====== BATTLE ======
export function renderKothBattle({ go }) {
  if (!game.koth?.started) { go('koth-setup', { replace: true }); return el('div'); }
  const s = game.koth;

  if (!s.king || !s.challenger) {
    // Pick someone if missing.
    if (!s.king) s.king = (pickRandomFrom(s.roster) || {}).id || null;
    if (!s.challenger) s.challenger = (pickRandomFrom(s.roster, [s.king]) || {}).id || null;
    if (!s.king || !s.challenger) {
      const root = el('section', {});
      root.appendChild(el('p', { class: 'note' }, 'Need at least two players on the roster.'));
      root.appendChild(el('button', { class: 'btn', onClick: () => go('koth-setup') }, 'Edit roster'));
      return root;
    }
  }

  const king = s.roster.find((p) => p.id === s.king);
  const challenger = s.roster.find((p) => p.id === s.challenger);

  const root = el('section', { class: 'battle' });

  // Header
  const header = el('div', { class: 'battle-header' },
    sideBlock(king,        '👑 On the mic', '#ffb03a'),
    el('div', { class: 'battle-vs' }, 'VS'),
    sideBlock(challenger,  'Challenger',     '#b73fff'),
  );
  root.appendChild(header);

  // Stage
  const stage = el('div', { class: 'stage' });

  const matchup = el('div', { class: 'matchup' },
    el('div', { class: 'who', style: { color: '#ffb03a', textAlign: 'right' } }, king.name),
    el('div', { class: 'vs' }, 'vs'),
    el('div', { class: 'who', style: { color: '#b73fff' } }, challenger.name),
  );
  stage.appendChild(matchup);

  // Hands (3 cards each)
  const ka = ensureHand(s, king.id);
  const ca = ensureHand(s, challenger.id);

  const cards = el('div', { class: 'cards' });
  cards.appendChild(handBlock(king.name, '#ffb03a', ka, () => renderKothBattle({ go })));
  cards.appendChild(handBlock(challenger.name, '#b73fff', ca, () => renderKothBattle({ go })));
  stage.appendChild(cards);

  stage.appendChild(buildTimer(s, () => renderKothBattle({ go })));

  const actions = el('div', { class: 'stage-actions' });
  actions.appendChild(el('div', { class: 'score-strip' },
    el('span', { class: 'pip' + (king.reign > 0 ? ' win' : '') }, `${king.name} reign: ${king.reign}`),
    el('span', { class: 'pip' }, `${challenger.name} wins: ${challenger.wins}`),
  ));

  const verdict = el('div', { class: 'verdict-actions' },
    el('button', { class: 'primarybtn', onClick: () => awardKoth(s, king.id, challenger.id, () => renderKothBattle({ go })) },
      `${king.name} keeps the crown`),
    el('button', { class: 'primarybtn violet', onClick: () => awardKoth(s, challenger.id, king.id, () => renderKothBattle({ go })) },
      `${challenger.name} takes the mic`),
  );
  actions.appendChild(verdict);

  stage.appendChild(actions);
  root.appendChild(stage);

  // Bench / leaderboard
  const wrap = el('div', { class: 'how-grid' });

  const board = el('div', { class: 'leaderboard' },
    el('h4', {}, 'Leaderboard'));
  const ranked = s.roster.slice().sort((a, b) =>
    (b.longestReign - a.longestReign) || (b.wins - a.wins));
  const ol = el('ol');
  ranked.forEach((p, i) => {
    ol.appendChild(el('li', {},
      i === 0 ? el('span', { class: 'crown' }, '👑') : null,
      el('strong', {}, p.name),
      ' ',
      el('span', { class: 'reign' },
        `(longest reign ${p.longestReign}, wins ${p.wins})`),
    ));
  });
  board.appendChild(ol);

  // Bench + jump-in
  const benchBlock = el('div', { class: 'leaderboard' },
    el('h4', {}, 'Bench (jump in any time)'));
  const bench = el('div', { class: 'bench' });
  s.roster.forEach((p) => {
    const cls = (p.id === s.king || p.id === s.challenger) ? 'chip up' : 'chip';
    const chip = el('button', { class: cls, onClick: () => {
      if (p.id === s.king || p.id === s.challenger) return;
      if (confirm(`Swap ${p.name} in as the next challenger?`)) {
        s.challenger = p.id;
        s.hands[p.id] = drawHandKoth();
        renderKothBattle({ go });
      }
    } }, p.name);
    bench.appendChild(chip);
  });
  benchBlock.appendChild(bench);

  const addRow = el('div', { class: 'add-row', style: { marginTop: '10px' } });
  const input = el('input', { class: 'input', placeholder: 'Add player on the fly', maxlength: 22 });
  const addBtn = el('button', { class: 'btn', onClick: () => {
    const name = input.value.trim();
    if (!name) return;
    s.roster.push({ id: s.nextId++, name, wins: 0, reign: 0, longestReign: 0 });
    input.value = '';
    renderKothBattle({ go });
  } }, 'Add');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtn.click(); });
  addRow.append(input, addBtn);
  benchBlock.appendChild(addRow);

  wrap.appendChild(board);
  wrap.appendChild(benchBlock);
  root.appendChild(wrap);

  // Bottom nav
  const nav = el('div', { class: 'btnrow' },
    el('button', { class: 'ghostbtn', onClick: () => { game.koth = null; window.MicDrop.go('koth-setup'); } }, 'Edit roster'),
    el('button', { class: 'ghostbtn', onClick: () => { if (confirm('End the cypher?')) { game.koth = null; window.MicDrop.go('home'); } } }, 'Quit'),
  );
  root.appendChild(nav);

  return root;
}

function sideBlock(player, sub, color) {
  const card = el('div', { class: 'battle-side', style: { borderColor: color } });
  card.appendChild(el('div', { class: 'sub' }, sub));
  card.appendChild(el('h3', { style: { color } }, player.name));
  card.appendChild(el('div', { class: 'note' }, `Reign: ${player.reign} · Wins: ${player.wins}`));
  return card;
}

function ensureHand(s, playerId) {
  if (!s.hands[playerId]) s.hands[playerId] = drawHandKoth();
  return s.hands[playerId];
}

function handBlock(name, color, hand, rerender) {
  const wrap = el('div', { class: 'card-hand' });
  wrap.appendChild(el('div', { class: 'section-title', style: { color } }, name));
  const stack = el('div', { class: 'cards', style: { gridTemplateColumns: 'repeat(3, 1fr)' } });
  hand.forEach((c) => stack.appendChild(cardElement(c, rerender)));
  wrap.appendChild(stack);
  return wrap;
}

function cardElement(card, rerender) {
  if (!card.__revealed) {
    return el('button', { class: 'card face-down', onClick: () => {
      card.__revealed = true;
      sfxIfOn('flip');
      rerender();
    } }, el('div', { class: 'kind' }, card.kind === 'rhyme' ? 'Rhyme' : 'Prompt'),
      el('div', { class: 'body' }, 'Tap to draw'));
  }
  return faceUp(card);
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
  if (t.remaining <= 0) display.classList.add('zero');

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

function awardKoth(s, winnerId, loserId, rerender) {
  const w = s.roster.find((p) => p.id === winnerId);
  const l = s.roster.find((p) => p.id === loserId);
  w.wins += 1;
  if (winnerId === s.king) {
    w.reign += 1;
    w.longestReign = Math.max(w.longestReign, w.reign);
    // King keeps the mic. Loser stays as challenger? No — pick a new challenger.
    l.reign = 0;
    const next = pickRandomFrom(s.roster, [s.king, loserId]) || pickRandomFrom(s.roster, [s.king]);
    if (next) s.challenger = next.id;
  } else {
    // Challenger dethrones king.
    l.longestReign = Math.max(l.longestReign, l.reign);
    l.reign = 0;
    s.king = winnerId;
    w.reign = 1;
    w.longestReign = Math.max(w.longestReign, w.reign);
    const next = pickRandomFrom(s.roster, [s.king, loserId]) || pickRandomFrom(s.roster, [s.king]);
    if (next) s.challenger = next.id;
  }
  // New cards for both up-players.
  s.hands[s.king] = drawHandKoth();
  s.hands[s.challenger] = drawHandKoth();
  s.timer = null;
  sfxIfOn('win');
  rerender();
}
