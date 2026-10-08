
// Drum machine voices and the step player. Works with a live AudioContext (the
// Beat Lab) and with an OfflineAudioContext (rendering a beat for the Beats
// player or a WAV download), so a saved beat sounds the same everywhere.

const clone = (o) => JSON.parse(JSON.stringify(o));   // structuredClone is too new for older phones

export const ROWS = [
  { id: 'kick', name: 'Kick' },
  { id: 'snare', name: 'Snare' },
  { id: 'clap', name: 'Clap' },
  { id: 'hat', name: 'Hi-hat', max: 3, hint: 'Tap again for a double or triple roll' },
  { id: 'ohat', name: 'Open hat' },
  { id: 'rim', name: 'Rim' },
  { id: 'bass', name: '808', max: 6, hint: 'Tap again to change the note' },
  { id: 'keys', name: 'Keys', hint: 'Plays the chord, which changes every bar' },
];

export const BASS_LABELS = ['', '1', '3', '4', '5', '7', '8'];
export const HAT_LABELS = ['', '', '×2', '×3'];
export const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Chord changes, one per bar: [root offset in semitones, chord tones].
export const PROGS = {
  dark:  { name: 'Dark  i–VI–III–VII', chords: [[0, [0, 3, 7, 10]], [8, [0, 4, 7, 11]], [3, [0, 4, 7, 11]], [10, [0, 4, 7]]] },
  soul:  { name: 'Soul  i–iv–VI–V', chords: [[0, [0, 3, 7, 10]], [5, [0, 3, 7, 10]], [8, [0, 4, 7, 11]], [7, [0, 4, 7, 10]]] },
  cold:  { name: 'Cold  i–VII–VI–VII', chords: [[0, [0, 3, 7, 10]], [10, [0, 4, 7]], [8, [0, 4, 7, 11]], [10, [0, 4, 7]]] },
  sunny: { name: 'Sunny  I–V–vi–IV', chords: [[0, [0, 4, 7, 11]], [7, [0, 4, 7]], [9, [0, 3, 7, 10]], [5, [0, 4, 7, 11]]] },
  drone: { name: 'One chord', chords: [[0, [0, 3, 7, 10]]] },
};

export const KEY_SOUNDS = { rhodes: 'Rhodes', bell: 'Bell', stab: 'Stab', pad: 'Pad' };

export const DEFAULT_VOL = { kick: 0.9, snare: 0.75, clap: 0.6, hat: 0.4, ohat: 0.35, rim: 0.45, bass: 0.85, keys: 0.45 };

export function emptyPattern() {
  return {
    v: 1, id: null, name: '', bpm: 90, swing: 0.1, key: 9, prog: 'dark', keysSound: 'rhodes',
    rows: Object.fromEntries(ROWS.map((r) => [r.id, new Array(16).fill(0)])),
    vol: { ...DEFAULT_VOL },
    mute: {},
  };
}

// Pattern rows written as strings: 0 = off, x = on, digits = roll count / bass note.
function rowsFrom(o) {
  return Object.fromEntries(ROWS.map((r) => [r.id, [...(o[r.id] || '0'.repeat(16))].map((c) => (c === 'x' ? 1 : +c || 0))]));
}

export const PRESETS = {
  boombap: { name: 'Boom bap', bpm: 90, swing: 0.14, key: 9, prog: 'dark', keysSound: 'rhodes', rows: rowsFrom({
    kick: 'x000000x00x00000', snare: '0000x0000000x000', hat: '1010101010101010',
    bass: '1000000100400000', keys: 'x000000000x00000' }) },
  trap: { name: 'Trap', bpm: 140, swing: 0, key: 1, prog: 'cold', keysSound: 'bell', rows: rowsFrom({
    kick: 'x000000x00x00x00', snare: '00000000x0000000', clap: '00000000x0000000', hat: '1111111211111131',
    bass: '1000000100400100', keys: 'x00000x00000x000' }) },
  lofi: { name: 'Lo-fi', bpm: 80, swing: 0.2, key: 2, prog: 'soul', keysSound: 'rhodes', rows: rowsFrom({
    kick: 'x00000000x0x0000', snare: '0000x0000000x000', hat: '1010101010101010', rim: '0000000x00000000',
    bass: '1000000001010000', keys: 'x000000000000000' }) },
  hype: { name: 'Hype', bpm: 104, swing: 0.06, key: 5, prog: 'sunny', keysSound: 'stab', rows: rowsFrom({
    kick: 'x00x0000x0x00000', clap: '0000x0000000x000', hat: '1000100010001000', ohat: '0010001000100010',
    bass: '1006000010100000', keys: '00x000x0000x0000' }) },
};

export function presetPattern(id) {
  const p = emptyPattern();
  const src = PRESETS[id];
  if (!src) return p;
  const { rows, ...rest } = src;
  Object.assign(p, clone(rest));
  p.rows = clone(rows);
  p.name = '';
  return p;
}

// ---------- harmony ----------
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
export const chordAt = (p, bar) => {
  const cs = (PROGS[p.prog] || PROGS.dark).chords;
  return cs[bar % cs.length];
};
export function chordName(p, bar) {
  const [off, tones] = chordAt(p, bar);
  const name = KEY_NAMES[(p.key + off) % 12];
  const minor = tones[1] === 3;
  return name + (minor ? 'm' : '') + (tones[3] === 10 ? '7' : tones[3] === 11 ? 'maj7' : '');
}
function bassMidi(p, chord, deg) {
  let root = 36 + p.key;                       // keep the 808 in 808 territory: ~46-87 Hz
  if (root > 41) root -= 12;
  root += chord[0];
  if (root > 47) root -= 12;
  const tones = chord[1];
  const off = [0, 0, tones[1], 5, 7, tones[3] ?? 10, 12][deg] ?? 0;
  return root + off;
}
function chordMidis(p, chord) {
  let root = 60 + p.key + chord[0];
  if (root > 66) root -= 12;
  return chord[1].map((x) => root + x);
}

// ---------- voices ----------
const noiseFor = new WeakMap();
function noise(ctx) {
  let b = noiseFor.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseFor.set(ctx, b);
  }
  return b;
}
const DRIVE = (() => {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) { const x = (i / 511.5) - 1; c[i] = Math.tanh(x * 2.6) / Math.tanh(2.6); }
  return c;
})();

function env(ctx, t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}
function osc(ctx, type, f, t, dur, dest) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t);
  o.connect(dest); o.start(t); o.stop(t + dur);
  return o;
}
function burst(ctx, t, dur, dest) {
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  n.connect(dest); n.start(t, Math.random() * 0.4); n.stop(t + dur);
  return n;
}
function filt(ctx, type, f, q = 0.7) {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  return b;
}

const V = {
  kick(ctx, out, t) {
    const sh = ctx.createWaveShaper(); sh.curve = DRIVE;
    const g = env(ctx, t, 1, 0.002, 0.42);
    sh.connect(g).connect(out);
    const o = osc(ctx, 'sine', 155, t, 0.5, sh);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const c = env(ctx, t, 0.25, 0.001, 0.012);
    const hp = filt(ctx, 'highpass', 1600);
    hp.connect(c).connect(out);
    burst(ctx, t, 0.03, hp);
  },
  snare(ctx, out, t) {
    const body = env(ctx, t, 0.55, 0.002, 0.11);
    body.connect(out);
    const o = osc(ctx, 'triangle', 190, t, 0.15, body);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    const hp = filt(ctx, 'highpass', 1400);
    const ng = env(ctx, t, 0.7, 0.002, 0.17);
    hp.connect(ng).connect(out);
    burst(ctx, t, 0.22, hp);
  },
  clap(ctx, out, t) {
    const bp = filt(ctx, 'bandpass', 1150, 1.1);
    bp.connect(out);
    for (const d of [0, 0.011, 0.023]) {
      const g = env(ctx, t + d, 0.9, 0.001, 0.012);
      g.connect(bp); burst(ctx, t + d, 0.03, g);
    }
    const tail = env(ctx, t + 0.03, 0.7, 0.002, 0.16);
    tail.connect(bp); burst(ctx, t + 0.03, 0.22, tail);
  },
  hat(ctx, out, t, v = 1) {
    const hp = filt(ctx, 'highpass', 7200);
    const g = env(ctx, t, 0.5 * v, 0.001, 0.04);
    hp.connect(g).connect(out);
    burst(ctx, t, 0.06, hp);
  },
  ohat(ctx, out, t) {
    const hp = filt(ctx, 'highpass', 6200);
    const g = env(ctx, t, 0.45, 0.002, 0.34);
    hp.connect(g).connect(out);
    burst(ctx, t, 0.4, hp);
    return g;
  },
  rim(ctx, out, t) {
    const bp = filt(ctx, 'bandpass', 1700, 2.5);
    const g = env(ctx, t, 0.8, 0.001, 0.05);
    bp.connect(g).connect(out);
    osc(ctx, 'square', 830, t, 0.07, bp);
    osc(ctx, 'triangle', 1660, t, 0.07, bp);
  },
  bass(ctx, out, t, f, len) {
    const sh = ctx.createWaveShaper(); sh.curve = DRIVE;
    const lp = filt(ctx, 'lowpass', 1100);
    const g = ctx.createGain();
    const dur = Math.max(0.18, len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    sh.connect(lp).connect(g).connect(out);
    const o = osc(ctx, 'sine', f * 1.7, t, dur + 0.05, sh);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    return g;
  },
  keys(ctx, out, t, freqs, len, sound) {
    const lp = filt(ctx, 'lowpass', sound === 'stab' ? 1900 : sound === 'pad' ? 1500 : 2600);
    lp.connect(out);
    const n = freqs.length;
    for (const f of freqs) {
      if (sound === 'bell') {
        const g = env(ctx, t, 0.5 / n, 0.003, 1.3);
        g.connect(lp);
        osc(ctx, 'sine', f * 2, t, 1.4, g);
        const g2 = env(ctx, t, 0.18 / n, 0.002, 0.35);
        g2.connect(lp);
        osc(ctx, 'sine', f * 6.02, t, 0.4, g2);
      } else if (sound === 'stab') {
        const g = env(ctx, t, 0.45 / n, 0.004, 0.2);
        g.connect(lp);
        osc(ctx, 'sawtooth', f * 0.997, t, 0.26, g);
        osc(ctx, 'sawtooth', f * 1.003, t, 0.26, g);
      } else if (sound === 'pad') {
        const dur = Math.max(0.5, len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.4 / n, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
        g.connect(lp);
        osc(ctx, 'triangle', f * 0.996, t, dur + 0.35, g);
        osc(ctx, 'triangle', f * 1.004, t, dur + 0.35, g);
      } else {                                         // rhodes-ish electric piano
        const g = env(ctx, t, 0.5 / n, 0.005, Math.min(1.8, Math.max(0.5, len + 0.3)));
        g.connect(lp);
        osc(ctx, 'sine', f, t, 2, g);
        const g2 = env(ctx, t, 0.16 / n, 0.002, 0.25);
        g2.connect(lp);
        osc(ctx, 'sine', f * 2, t, 0.3, g2);
      }
    }
  },
};

// Single sound for previewing a lane.
export function preview(chain, rowId, p) {
  const t = chain.ctx.currentTime + 0.02;
  playStep(chain, { ...p, rows: Object.fromEntries(ROWS.map((r) => [r.id, r.id === rowId ? [p.rows[rowId][0] || 1] : [0]])) }, 0, 0, t, 0.125, true);
}

// ---------- player ----------
export function buildChain(ctx, dest) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4;
  comp.attack.value = 0.004; comp.release.value = 0.16;
  const out = ctx.createGain();
  out.gain.value = 0.95;
  comp.connect(out).connect(dest);
  const rows = {};
  for (const r of ROWS) { rows[r.id] = ctx.createGain(); rows[r.id].connect(comp); }
  return { ctx, rows, out, openHat: null, bassVoice: null };
}

export function applyMix(chain, p) {
  for (const r of ROWS) chain.rows[r.id].gain.value = p.mute[r.id] ? 0 : (p.vol[r.id] ?? 0.6);
}

function choke(g, t) {
  if (!g) return;
  try {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.012);
  } catch { /* already finished */ }
}

// Steps until the next hit in this row, so 808s and chords ring until the next one.
function gapAfter(row, step) {
  for (let k = 1; k <= 16; k++) if (row[(step + k) % 16]) return k;
  return 16;
}

export function playStep(chain, p, step, bar, t, sd, single = false) {
  const { ctx, rows: out } = chain;
  const R = p.rows;
  const chord = chordAt(p, bar);
  if (R.kick[step]) V.kick(ctx, out.kick, t);
  if (R.snare[step]) V.snare(ctx, out.snare, t);
  if (R.clap[step]) V.clap(ctx, out.clap, t);
  if (R.hat[step]) {
    const n = Math.min(3, R.hat[step]);
    for (let i = 0; i < n; i++) V.hat(ctx, out.hat, t + (i * sd) / n, i ? 0.75 : 1);
    choke(chain.openHat, t);
  }
  if (R.ohat[step]) { choke(chain.openHat, t); chain.openHat = V.ohat(ctx, out.ohat, t); }
  if (R.rim[step]) V.rim(ctx, out.rim, t);
  if (R.bass[step]) {
    choke(chain.bassVoice, t);
    const len = single ? 0.6 : gapAfter(R.bass, step) * sd;
    chain.bassVoice = V.bass(ctx, out.bass, t, hz(bassMidi(p, chord, R.bass[step])), Math.min(1.6, len));
  }
  if (R.keys[step]) {
    const len = single ? 0.8 : gapAfter(R.keys, step) * sd;
    V.keys(ctx, out.keys, t, chordMidis(p, chord).map(hz), Math.min(2.5, len), p.keysSound);
  }
}
