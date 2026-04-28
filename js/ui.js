// Tiny DOM helpers. No dependencies.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class')      node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html')  node.innerHTML = v;
    else if (k === 'text')  node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'data' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else {
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function tpl(id) {
  const t = document.getElementById(id);
  if (!t) throw new Error(`Missing template #${id}`);
  return t.content.cloneNode(true);
}

export function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Simple in-page sound effects via WebAudio (no asset dependency).
// Quiet, short, used to punctuate card flips and round transitions.
let _ac = null;
function ac() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  if (_ac.state === 'suspended') _ac.tryResume?.() ?? _ac.resume?.();
  return _ac;
}
export function sfx(kind, { volume = 0.3 } = {}) {
  try {
    const a = ac();
    const t0 = a.currentTime;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t0);
    g.connect(a.destination);
    const o = a.createOscillator();
    o.connect(g);

    let dur = 0.18;
    if (kind === 'flip') {
      o.type = 'square';
      o.frequency.setValueAtTime(440, t0);
      o.frequency.exponentialRampToValueAtTime(880, t0 + 0.08);
      g.gain.linearRampToValueAtTime(volume, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    } else if (kind === 'win') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(523, t0);
      o.frequency.setValueAtTime(659, t0 + 0.08);
      o.frequency.setValueAtTime(784, t0 + 0.16);
      g.gain.linearRampToValueAtTime(volume, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
      dur = 0.34;
    } else if (kind === 'tick') {
      o.type = 'square';
      o.frequency.setValueAtTime(900, t0);
      g.gain.linearRampToValueAtTime(volume * 0.4, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
      dur = 0.06;
    } else if (kind === 'horn') {
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t0);
      o.frequency.linearRampToValueAtTime(280, t0 + 0.5);
      g.gain.linearRampToValueAtTime(volume * 0.6, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
      dur = 0.6;
    } else {
      o.frequency.setValueAtTime(660, t0);
      g.gain.linearRampToValueAtTime(volume, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch { /* noop */ }
}
