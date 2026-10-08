// Saved Beat Lab beats: localStorage, offline rendering for the Beats player,
// WAV export and share links.

import { ROWS, emptyPattern, buildChain, applyMix, playStep, KEY_NAMES, PROGS, KEY_SOUNDS } from './synth.js';

const clone = (o) => JSON.parse(JSON.stringify(o));   // structuredClone is too new for older phones

const KEY = 'micdrop:beats:v1';

export function listBeats() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full or blocked */ }
  window.dispatchEvent(new Event('micdrop:beats'));
}

export function saveBeat(pattern) {
  const list = listBeats();
  const id = pattern.id || `b${Date.now().toString(36)}`;
  pattern.id = id;
  const entry = { id, name: pattern.name.trim() || 'Untitled beat', saved: Date.now(), pattern: clone(pattern) };
  const i = list.findIndex((b) => b.id === id);
  if (i >= 0) list.splice(i, 1);
  list.unshift(entry);
  write(list.slice(0, 60));
  return entry;
}

export function deleteBeat(id) { write(listBeats().filter((b) => b.id !== id)); }

// Saved beats as tracks the mixer can play. They render the first time they're played.
export function beatTracks() {
  return listBeats().map((b) => ({
    genre: 'mine', file: b.id, key: `mine/${b.id}/${b.saved}`,
    title: b.name, artist: 'Beat Lab', bpm: b.pattern.bpm, bars: 4,
    render: (ctx) => renderBeat(b.pattern, { bars: 4, sampleRate: ctx.sampleRate }),
  }));
}

// Render `bars` bars into an AudioBuffer that loops seamlessly (the ring-out of the
// last bar is folded back onto the start).
export async function renderBeat(p, { bars = 4, sampleRate = 44100 } = {}) {
  const sd = 60 / p.bpm / 4;
  const loop = bars * 16 * sd;
  const tail = 2;
  const off = new OfflineAudioContext(2, Math.ceil((loop + tail) * sampleRate), sampleRate);
  const chain = buildChain(off, off.destination);
  applyMix(chain, p);
  for (let bar = 0; bar < bars; bar++) {
    for (let s = 0; s < 16; s++) {
      playStep(chain, p, s, bar, (bar * 16 + s) * sd + (s % 2 ? p.swing * sd : 0), sd);
    }
  }
  const rendered = await off.startRendering();
  const n = Math.round(loop * sampleRate);
  const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate });
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = buf.getChannelData(c);
    dst.set(src.subarray(0, n));
    for (let i = n; i < src.length && i - n < n; i++) dst[i - n] += src[i];
  }
  return buf;
}

export function toWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const view = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * ch * 2, true); view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// ---------- share links: #beat=<base64url> ----------
const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeBeat(p) {
  return b64url(JSON.stringify({
    n: p.name, b: p.bpm, s: Math.round(p.swing * 100), k: p.key, c: p.prog, x: p.keysSound,
    r: ROWS.map((r) => p.rows[r.id].join('')).join('.'),
    v: ROWS.map((r) => Math.round((p.vol[r.id] ?? 0.6) * 100)).join('.'),
  }));
}

export function decodeBeat(str) {
  try {
    const o = JSON.parse(unb64url(str));
    const p = emptyPattern();
    p.name = String(o.n || '').slice(0, 40);
    p.bpm = Math.min(180, Math.max(60, +o.b || 90));
    p.swing = Math.min(0.5, Math.max(0, (+o.s || 0) / 100));
    p.key = KEY_NAMES[o.k] ? +o.k : 9;
    p.prog = PROGS[o.c] ? o.c : 'dark';
    p.keysSound = KEY_SOUNDS[o.x] ? o.x : 'rhodes';
    const rows = String(o.r || '').split('.');
    const vols = String(o.v || '').split('.');
    ROWS.forEach((r, i) => {
      const s = rows[i] || '';
      p.rows[r.id] = Array.from({ length: 16 }, (_, k) => Math.min(r.max || 1, Math.max(0, +s[k] || 0)));
      if (vols[i] != null && vols[i] !== '') p.vol[r.id] = Math.min(1, Math.max(0, +vols[i] / 100));
    });
    return p;
  } catch {
    return null;
  }
}
