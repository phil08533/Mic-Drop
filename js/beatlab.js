// Beat Lab: a 16-step drum machine with an 808 and chords.
// Patterns loop one bar; the chord changes every bar, so even a bare pattern grooves.

import { el, clear, toast, ask, shuffle } from './ui.js';
import { icon } from './icons.js';
import { audio, playTrack } from './mixer.js';
import {
  ROWS, BASS_LABELS, HAT_LABELS, KEY_NAMES, PROGS, KEY_SOUNDS, PRESETS,
  emptyPattern, presetPattern, buildChain, applyMix, playStep, chordName, preview,
} from './synth.js';
import { listBeats, saveBeat, deleteBeat, renderBeat, toWav, encodeBeat, beatTracks } from './beatstore.js';

const DRAFT_KEY = 'micdrop:lab:draft';

let pattern = loadDraft() || presetPattern('boombap');
let playing = false, timer = 0, chain = null, previewChain = null;
let nextT = 0, step = 0, bar = 0, raf = 0;
let queue = [];                 // scheduled steps waiting to light up: {step, bar, t}
let refs = null;                // DOM of the mounted screen

function loadDraft() {
  try { const p = JSON.parse(localStorage.getItem(DRAFT_KEY)); return p && p.rows ? p : null; } catch { return null; }
}
function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(pattern)); } catch { /* noop */ } }

export function openPattern(p) { stop(); pattern = p; saveDraft(); }

// ---------- transport ----------
window.addEventListener('micdrop:audio', (e) => { if (e.detail !== 'lab') stop(); });

function start() {
  const { ctx, bus } = audio();
  window.dispatchEvent(new CustomEvent('micdrop:audio', { detail: 'lab' }));
  chain = buildChain(ctx, bus);
  applyMix(chain, pattern);
  step = 0; bar = 0; queue = [];
  nextT = ctx.currentTime + 0.06;
  playing = true;
  schedule();
  timer = setInterval(schedule, 25);
  paintTransport();
  raf = requestAnimationFrame(frame);
}

function stop() {
  if (!playing) return;
  playing = false;
  clearInterval(timer);
  cancelAnimationFrame(raf);
  const c = chain; chain = null;
  if (c) {
    c.out.gain.setTargetAtTime(0, c.ctx.currentTime, 0.03);
    setTimeout(() => c.out.disconnect(), 400);
  }
  paintTransport();
  paintPlayhead(-1, 0);
}

function schedule() {
  if (!chain) return;
  const sd = 60 / pattern.bpm / 4;
  while (nextT < chain.ctx.currentTime + 0.12) {
    const t = nextT + (step % 2 ? pattern.swing * sd : 0);
    playStep(chain, pattern, step, bar, t, sd);
    queue.push({ step, bar, t });
    nextT += sd;
    if (++step === 16) { step = 0; bar++; }
  }
}

function frame() {
  if (!playing) return;
  raf = requestAnimationFrame(frame);
  const now = chain.ctx.currentTime;
  let cur = null;
  while (queue.length && queue[0].t <= now) cur = queue.shift();
  if (cur) paintPlayhead(cur.step, cur.bar);
}

function changed() {
  saveDraft();
  if (chain) applyMix(chain, pattern);
}

function audition(rowId) {
  if (playing) return;
  const { ctx, bus } = audio();
  if (!previewChain || previewChain.ctx !== ctx) previewChain = buildChain(ctx, bus);
  applyMix(previewChain, { ...pattern, mute: {} });
  preview(previewChain, rowId, pattern);
}

// ---------- random beat ----------
function shake() {
  const rnd = (n) => Math.floor(Math.random() * n);
  const R = Object.fromEntries(ROWS.map((r) => [r.id, new Array(16).fill(0)]));
  const half = pattern.bpm >= 120;                          // trap tempos ride a half-time backbeat
  R.kick[0] = 1;
  for (const i of shuffle(half ? [3, 6, 7, 10, 11, 13, 14] : [6, 7, 8, 10, 11, 14, 15]).slice(0, 2 + rnd(2))) R.kick[i] = 1;
  if (half) {
    R.clap[8] = 1;
    if (Math.random() < 0.6) R.snare[8] = 1;
  } else {
    R.snare[4] = R.snare[12] = 1;
    if (Math.random() < 0.4) R.clap[4] = R.clap[12] = 1;
    if (Math.random() < 0.3) R.snare[15] = 1;
  }
  const every = half || Math.random() < 0.35 ? 1 : 2;
  for (let i = 0; i < 16; i += every) R.hat[i] = 1;
  if (half) for (const i of shuffle([3, 7, 11, 14, 15]).slice(0, 2)) R.hat[i] = Math.random() < 0.4 ? 3 : 2;
  if (!half && Math.random() < 0.4) for (const i of [2, 6, 10, 14]) { R.ohat[i] = 1; R.hat[i] = 0; }
  if (Math.random() < 0.35) for (const i of shuffle([3, 7, 11, 13]).slice(0, 1 + rnd(2))) R.rim[i] = 1;
  for (let i = 0; i < 16; i++) if (R.kick[i]) R.bass[i] = i === 0 ? 1 : [1, 1, 1, 4, 4, 5, 6][rnd(7)];
  for (const i of shuffle([0, 2, 6, 8, 10, 11, 14]).slice(0, 1 + rnd(3))) R.keys[i] = 1;
  pattern.rows = R;
  pattern.prog = shuffle(['dark', 'soul', 'cold', 'sunny'])[0];
  pattern.keysSound = shuffle(Object.keys(KEY_SOUNDS))[0];
  pattern.key = rnd(12);
  changed();
}

// ---------- screen ----------
export function renderBeatLab({ go } = {}) {
  refs = { cells: {}, lanes: {} };
  const root = el('section', { class: 'lab' });

  root.append(
    el('header', { class: 'screen-head' },
      el('p', { class: 'kicker' }, 'Beat Lab'),
      el('h2', { class: 'screen-title' }, 'Make the beat. ', el('em', {}, 'Then battle on it.')),
      el('p', { class: 'lede' },
        'Tap squares to build a one-bar loop. The chords change every bar, so even a simple pattern turns into a beat. ',
        'Save it and it shows up in the Beats player under My Beats.')),
  );

  root.appendChild(transport());
  root.appendChild(grid());
  root.appendChild(tools(go));
  root.appendChild(savedList());
  paintTransport();
  return root;
}

function transport() {
  refs.play = el('button', { class: 'btn ink big play', onClick: () => (playing ? stop() : start()) });
  const bpmVal = el('input', {
    class: 'num', type: 'number', min: 60, max: 180, value: pattern.bpm, 'aria-label': 'Tempo in BPM',
    onChange: (e) => setBpm(+e.target.value),
  });
  const setBpm = (v) => {
    pattern.bpm = Math.min(180, Math.max(60, Math.round(v) || 90));
    bpmVal.value = pattern.bpm;
    changed();
  };
  refs.bpm = bpmVal;

  const swingLabel = el('span', { class: 'val' }, `${Math.round(pattern.swing * 100)}%`);
  const swing = el('input', {
    type: 'range', min: 0, max: 45, value: Math.round(pattern.swing * 100), 'aria-label': 'Swing',
    onInput: (e) => { pattern.swing = +e.target.value / 100; swingLabel.textContent = `${e.target.value}%`; changed(); },
  });

  const select = (opts, value, onChange, label) => {
    const s = el('select', { class: 'select', 'aria-label': label, onChange: (e) => onChange(e.target.value) },
      ...Object.entries(opts).map(([v, name]) => el('option', { value: v }, name)));
    s.value = String(value);
    return s;
  };

  refs.chord = el('span', { class: 'chord' }, chordName(pattern, 0));
  refs.barNo = el('span', { class: 'barno' }, 'Bar 1');
  refs.keySel = select(Object.fromEntries(KEY_NAMES.map((k, i) => [i, k])), pattern.key, (v) => { pattern.key = +v; changed(); paintChord(0); }, 'Key');
  refs.progSel = select(Object.fromEntries(Object.entries(PROGS).map(([k, v]) => [k, v.name])), pattern.prog, (v) => { pattern.prog = v; changed(); paintChord(0); }, 'Chords');
  refs.soundSel = select(KEY_SOUNDS, pattern.keysSound, (v) => { pattern.keysSound = v; changed(); }, 'Keys sound');

  return el('div', { class: 'transport panel' },
    refs.play,
    el('div', { class: 'field tempo' },
      el('label', {}, 'Tempo'),
      el('div', { class: 'stepper' },
        el('button', { class: 'btn icon', 'aria-label': 'Slower', onClick: () => setBpm(pattern.bpm - 1) }, icon('minus', 16)),
        bpmVal,
        el('button', { class: 'btn icon', 'aria-label': 'Faster', onClick: () => setBpm(pattern.bpm + 1) }, icon('plus', 16))),
      el('span', { class: 'unit' }, 'BPM')),
    el('div', { class: 'field' }, el('label', {}, 'Swing ', swingLabel), swing),
    el('div', { class: 'field' }, el('label', {}, 'Key'), refs.keySel),
    el('div', { class: 'field' }, el('label', {}, 'Chords'), refs.progSel),
    el('div', { class: 'field' }, el('label', {}, 'Keys sound'), refs.soundSel),
    el('div', { class: 'readout' }, refs.barNo, refs.chord),
  );
}

function cellText(row, v) {
  if (!v) return '';
  if (row.id === 'bass') return BASS_LABELS[v];
  if (row.id === 'hat') return HAT_LABELS[v];
  return '';
}

function paintCell(row, i) {
  const c = refs.cells[row.id][i];
  const v = pattern.rows[row.id][i];
  c.classList.toggle('on', !!v);
  c.setAttribute('aria-pressed', String(!!v));
  c.textContent = cellText(row, v);
}

function grid() {
  const wrap = el('div', { class: 'seq panel', role: 'grid', 'aria-label': 'Step sequencer' });
  const ruler = el('div', { class: 'seq-row ruler', 'aria-hidden': 'true' },
    el('div', { class: 'lane' }),
    el('div', { class: 'steps' }, ...Array.from({ length: 16 }, (_, i) => el('span', { class: i % 4 === 0 ? 'downbeat' : '' }, i % 4 === 0 ? String(i / 4 + 1) : '·'))));
  wrap.appendChild(ruler);

  for (const row of ROWS) {
    const name = el('button', {
      class: 'lane-name', title: row.hint ? `${row.hint}. Tap the name to mute.` : 'Tap to mute',
      'aria-pressed': String(!!pattern.mute[row.id]),
      onClick: () => {
        pattern.mute[row.id] = !pattern.mute[row.id];
        name.classList.toggle('muted', pattern.mute[row.id]);
        name.setAttribute('aria-pressed', String(pattern.mute[row.id]));
        changed();
      },
    }, row.name);
    name.classList.toggle('muted', !!pattern.mute[row.id]);
    const vol = el('input', {
      type: 'range', min: 0, max: 100, value: Math.round((pattern.vol[row.id] ?? 0.6) * 100), class: 'lane-vol',
      'aria-label': `${row.name} volume`,
      onInput: (e) => { pattern.vol[row.id] = +e.target.value / 100; changed(); },
    });
    refs.lanes[row.id] = { name, vol };
    const steps = el('div', { class: 'steps' });
    refs.cells[row.id] = [];
    for (let i = 0; i < 16; i++) {
      const c = el('button', {
        class: 'step' + (i % 4 === 0 ? ' downbeat' : ''), 'aria-label': `${row.name} step ${i + 1}`,
        onClick: () => {
          const max = row.max || 1;
          pattern.rows[row.id][i] = (pattern.rows[row.id][i] + 1) % (max + 1);
          paintCell(row, i);
          changed();
          if (pattern.rows[row.id][i]) audition(row.id);
        },
      });
      refs.cells[row.id].push(c);
      steps.appendChild(c);
    }
    wrap.appendChild(el('div', { class: `seq-row r-${row.id}` }, el('div', { class: 'lane' }, name, vol), steps));
    for (let i = 0; i < 16; i++) paintCell(row, i);
  }
  wrap.appendChild(el('p', { class: 'fine' },
    'Hi-hat: tap again for a ×2 or ×3 roll. 808: tap again to walk the note up (1, 3, 4, 5, 7, 8). Tap a sound\'s name to mute it.'));
  return wrap;
}

function repaintAll() {
  for (const row of ROWS) {
    for (let i = 0; i < 16; i++) paintCell(row, i);
    const l = refs.lanes[row.id];
    l.vol.value = Math.round((pattern.vol[row.id] ?? 0.6) * 100);
    l.name.classList.toggle('muted', !!pattern.mute[row.id]);
  }
  refs.bpm.value = pattern.bpm;
  refs.keySel.value = String(pattern.key);
  refs.progSel.value = pattern.prog;
  refs.soundSel.value = pattern.keysSound;
  refs.name.value = pattern.name || '';
  paintChord(0);
}

function tools() {
  const presetSel = el('select', { class: 'select', 'aria-label': 'Start from a preset',
    onChange: async (e) => {
      const v = e.target.value;
      e.target.value = '';
      if (!v) return;
      const keep = pattern.bpm;
      pattern = v === 'empty' ? emptyPattern() : presetPattern(v);
      if (v === 'empty') pattern.bpm = keep;
      changed();
      rebuild();
    } },
  el('option', { value: '' }, 'Start from…'),
  ...Object.entries(PRESETS).map(([k, v]) => el('option', { value: k }, `${v.name} · ${v.bpm} BPM`)),
  el('option', { value: 'empty' }, 'Empty grid'));

  refs.name = el('input', { class: 'input', placeholder: 'Name this beat', maxlength: 40, value: pattern.name || '',
    onInput: (e) => { pattern.name = e.target.value; saveDraft(); } });

  return el('div', { class: 'lab-tools' },
    el('div', { class: 'btnrow' },
      presetSel,
      el('button', { class: 'btn', onClick: () => { shake(); repaintAll(); } }, icon('dice', 18), 'Shake it up'),
      el('button', { class: 'btn', onClick: async () => {
        if (await ask('Clear every step?', { ok: 'Clear it' })) {
          for (const r of ROWS) pattern.rows[r.id].fill(0);
          changed(); repaintAll();
        }
      } }, icon('trash', 18), 'Clear')),
    el('div', { class: 'btnrow save-row' },
      refs.name,
      el('button', { class: 'btn red', onClick: () => {
        const entry = saveBeat(pattern);
        saveDraft();
        toast(`Saved “${entry.name}”. It's in the Beats player under My Beats.`);
        refreshSaved();
      } }, icon('save', 18), 'Save to My Beats'),
      el('button', { class: 'btn', onClick: downloadWav }, icon('download', 18), 'WAV'),
      el('button', { class: 'btn', onClick: copyLink }, icon('link', 18), 'Share link')),
  );
}

async function downloadWav() {
  toast('Bouncing 8 bars…', 1500);
  try {
    const buf = await renderBeat(pattern, { bars: 8, sampleRate: 44100 });
    const url = URL.createObjectURL(toWav(buf));
    const a = el('a', { href: url, download: `${(pattern.name || 'mic-drop-beat').replace(/[^\w-]+/g, '-').toLowerCase()}.wav` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.warn(err);
    toast('Couldn’t render the WAV in this browser.');
  }
}

async function copyLink() {
  const url = `${location.origin}${location.pathname}#beat=${encodeBeat(pattern)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied. Anyone who opens it gets this beat in their Beat Lab.');
  } catch {
    prompt('Copy this link:', url);
  }
}

function savedList() {
  refs.saved = el('div', { class: 'saved panel' });
  refreshSaved();
  return refs.saved;
}

function refreshSaved() {
  if (!refs?.saved) return;
  const box = refs.saved;
  clear(box);
  box.appendChild(el('h3', { class: 'panel-title' }, 'My Beats'));
  const beats = listBeats();
  if (!beats.length) {
    box.appendChild(el('p', { class: 'fine' }, 'Nothing saved yet. Name your beat and hit Save.'));
    return;
  }
  const ul = el('ul', { class: 'saved-list' });
  for (const b of beats) {
    ul.appendChild(el('li', {},
      el('span', { class: 'saved-name' }, b.name),
      el('span', { class: 'fine' }, `${b.pattern.bpm} BPM`),
      el('span', { class: 'saved-actions' },
        el('button', { class: 'btn small', onClick: () => {
          stop();
          pattern = structuredClone(b.pattern);
          changed();
          rebuild();
          toast(`Loaded “${b.name}”.`);
        } }, 'Edit'),
        el('button', { class: 'btn small', title: 'Play it in the Beats player', onClick: () => {
          const t = beatTracks().find((x) => x.file === b.id);
          if (t) playTrack(t).then(() => toast(`Now playing “${b.name}”.`)).catch(() => toast('Couldn’t play that beat.'));
        } }, icon('play', 14), 'Play'),
        el('button', { class: 'btn small icon', 'aria-label': `Delete ${b.name}`, onClick: async () => {
          if (await ask(`Delete “${b.name}”?`, { ok: 'Delete', danger: true })) { deleteBeat(b.id); refreshSaved(); }
        } }, icon('trash', 14)))));
  }
  box.appendChild(ul);
}

function rebuild() {
  // Re-render the whole screen in place (preset / load change everything at once).
  const host = document.querySelector('.lab');
  if (!host) return;
  host.replaceWith(renderBeatLab());
}

function paintTransport() {
  if (!refs?.play) return;
  clear(refs.play);
  refs.play.append(icon(playing ? 'stop' : 'play', 20), playing ? 'Stop' : 'Play');
  refs.play.classList.toggle('red', playing);
}

function paintChord(b) {
  if (!refs?.chord) return;
  refs.chord.textContent = chordName(pattern, b);
  refs.barNo.textContent = `Bar ${(b % (PROGS[pattern.prog]?.chords.length || 1)) + 1}`;
}

let lastCol = -1;
function paintPlayhead(col, b) {
  if (!refs?.cells?.kick?.[0]?.isConnected) return;
  if (lastCol >= 0) for (const r of ROWS) refs.cells[r.id][lastCol].classList.remove('now');
  if (col >= 0) {
    for (const r of ROWS) refs.cells[r.id][col].classList.add('now');
    if (col === 0) paintChord(b);
  }
  lastCol = col;
}

// Space bar plays/stops while the lab is on screen.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || !document.querySelector('.lab')) return;
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName)) return;
  e.preventDefault();
  if (playing) stop(); else start();
});
