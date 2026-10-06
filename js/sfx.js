// Sound effects and the battle soundboard, all synthesised (no samples).
// They play on the shared AudioContext but skip the music bus, so pausing or
// ducking the beat never cuts off an air horn.

import { settings } from './state.js';
import { audio } from './mixer.js';

let out = null;
let noiseBuf = null;

function setup() {
  const { ctx } = audio();
  if (!out) {
    out = ctx.createGain();
    out.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  out.gain.value = settings.get('sfxVolume');
  return ctx;
}

function env(ctx, t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function osc(ctx, type, freq, t, dur, dest) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(dest);
  o.start(t); o.stop(t + dur);
  return o;
}

function noise(ctx, t, dur, dest) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  n.connect(dest);
  n.start(t, Math.random() * 0.5); n.stop(t + dur);
  return n;
}

const SOUNDS = {
  flip(ctx, t) {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.8;
    const g = env(ctx, t, 0.5, 0.004, 0.09);
    f.connect(g).connect(out);
    noise(ctx, t, 0.12, f);
  },
  tick(ctx, t) {
    const g = env(ctx, t, 0.25, 0.002, 0.05);
    g.connect(out);
    osc(ctx, 'square', 1100, t, 0.07, g);
  },
  // Boxing bell: inharmonic partials, struck twice.
  bell(ctx, t) {
    for (const hit of [0, 0.28]) {
      for (const [ratio, amp, dec] of [[1, 0.5, 1.6], [2.76, 0.28, 0.9], [5.4, 0.16, 0.5], [8.93, 0.08, 0.3]]) {
        const g = env(ctx, t + hit, amp * 0.6, 0.002, dec);
        g.connect(out);
        osc(ctx, 'sine', 830 * ratio, t + hit, dec + 0.1, g);
      }
    }
  },
  // Buzzer when the clock hits zero.
  horn(ctx, t) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    const g = env(ctx, t, 0.35, 0.01, 0.7);
    f.connect(g).connect(out);
    osc(ctx, 'sawtooth', 110, t, 0.8, f);
    osc(ctx, 'sawtooth', 112.5, t, 0.8, f);
  },
  // Reggae-style air horn: BWA, BWA, BWAAAAA.
  airhorn(ctx, t) {
    for (const [start, len] of [[0, 0.16], [0.21, 0.16], [0.42, 0.7]]) {
      const f = ctx.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = 1800; f.gain.value = 8;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
      const g = ctx.createGain();
      const s = t + start;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.32, s + 0.015);
      g.gain.setValueAtTime(0.32, s + len - 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, s + len);
      f.connect(lp).connect(g).connect(out);
      for (const fr of [466, 469, 932, 700]) {
        const o = osc(ctx, 'sawtooth', fr * 0.97, s, len + 0.02, f);
        o.frequency.exponentialRampToValueAtTime(fr, s + 0.05);
      }
    }
  },
  // Big low boom for a mic drop.
  boom(ctx, t) {
    const g = env(ctx, t, 0.9, 0.003, 1.4);
    g.connect(out);
    const o = osc(ctx, 'sine', 120, t, 1.5, g);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.9);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const ng = env(ctx, t, 0.6, 0.002, 0.5);
    f.connect(ng).connect(out);
    noise(ctx, t, 0.6, f);
    // feedback squeal as the mic hits the floor
    const sq = env(ctx, t + 0.15, 0.05, 0.2, 0.9);
    sq.connect(out);
    const so = osc(ctx, 'sine', 2900, t + 0.15, 1.2, sq);
    so.frequency.linearRampToValueAtTime(3300, t + 1.2);
  },
  // Crowd applause: lots of short random claps.
  applause(ctx, t) {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.6;
    f.connect(out);
    for (let i = 0; i < 90; i++) {
      const s = t + Math.random() * 2.2;
      const g = env(ctx, s, 0.12 * (1 - (s - t) / 2.6), 0.002, 0.03 + Math.random() * 0.03);
      g.connect(f);
      noise(ctx, s, 0.08, g);
    }
  },
  win(ctx, t) {
    [523, 659, 784, 1047].forEach((fr, i) => {
      const g = env(ctx, t + i * 0.09, 0.22, 0.005, 0.35);
      g.connect(out);
      osc(ctx, 'triangle', fr, t + i * 0.09, 0.45, g);
    });
  },
};

export function sfx(kind) {
  if (!settings.get('sfxOn')) return;
  try {
    const ctx = setup();
    SOUNDS[kind]?.(ctx, ctx.currentTime + 0.01);
  } catch { /* audio unavailable */ }
}
