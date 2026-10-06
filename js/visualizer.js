// Full-screen visualizer, like the old media players had: MilkDrop presets
// rendered by butterchurn (MIT, vendor/butterchurn) on WebGL 2, reacting to
// whatever the Beats player or Beat Lab is playing. Without WebGL 2 it falls
// back to plain spectrum bars.

import { el, shuffle } from './ui.js';
import { icon } from './icons.js';
import { audio, isPlaying, playTrack, pickNext, mixer, nowPlaying, onMixerChange } from './mixer.js';

const CYCLE_MS = 24000;
let lib = null;

function script(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadLib() {
  if (!lib) {
    lib = Promise.all([
      script('vendor/butterchurn/butterchurn.min.js'),
      script('vendor/butterchurn/butterchurnPresets.min.js'),
    ]).then(() => {
      const bc = window.butterchurn.default || window.butterchurn;
      const packs = window.butterchurnPresets.default || window.butterchurnPresets;
      return { bc, presets: packs.getPresets() };
    });
    lib.catch(() => { lib = null; });
  }
  return lib;
}

export async function openVisualizer() {
  if (document.querySelector('.viz')) return;
  const { ctx, bus } = audio();
  const canvas = el('canvas', { class: 'viz-canvas' });
  const preset = el('span', { class: 'viz-preset' }, 'Loading visuals…');
  const track = el('span', { class: 'viz-track' });
  const idle = el('div', { class: 'viz-idle' },
    el('p', {}, 'Nothing playing.'),
    el('button', { class: 'btn ink', onClick: () => {
      const t = pickNext() || mixer.queue[0];
      if (t) playTrack(t).catch(() => {});
    } }, icon('play', 18), 'Play a beat'));
  let auto = true;
  const autoBtn = el('button', { class: 'btn small on', 'aria-pressed': 'true', onClick: () => {
    auto = !auto;
    autoBtn.classList.toggle('on', auto);
    autoBtn.setAttribute('aria-pressed', String(auto));
  } }, 'Auto');
  const ui = el('div', { class: 'viz-ui' },
    el('div', { class: 'viz-info' }, track, preset),
    el('div', { class: 'viz-btns' },
      el('button', { class: 'btn small icon', 'aria-label': 'Previous visual', onClick: () => step(-1) }, icon('arrowL', 18)),
      el('button', { class: 'btn small icon', 'aria-label': 'Next visual', onClick: () => step(1) }, icon('arrowR', 18)),
      autoBtn,
      el('button', { class: 'btn small icon', 'aria-label': 'Full screen', onClick: () => {
        if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen?.().catch(() => {});
      } }, icon('fullscreen', 18)),
      el('button', { class: 'btn small icon', 'aria-label': 'Close visualizer', onClick: () => close() }, icon('close', 18))));
  const wrap = el('div', { class: 'viz', role: 'dialog', 'aria-label': 'Visualizer' }, canvas, idle, ui);
  document.body.appendChild(wrap);

  let raf = 0, cycle = 0, hide = 0, viz = null, analyser = null, keys = [], at = 0, presets = null;
  const offChange = onMixerChange(paintInfo);
  paintInfo();

  function paintInfo() {
    const t = nowPlaying();
    track.textContent = t ? `${t.title}${t.bpm ? ` · ${Math.round(mixer.tempo || t.bpm)} BPM` : ''}` : 'Beat Lab / nothing in the player';
    idle.hidden = isPlaying() || !!document.querySelector('.lab .play.red');
  }

  function size() {
    canvas.width = Math.round(innerWidth);
    canvas.height = Math.round(innerHeight);
    viz?.setRendererSize(canvas.width, canvas.height);
  }

  function step(d) {
    if (!viz) return;
    at = (at + d + keys.length) % keys.length;
    viz.loadPreset(presets[keys[at]], 2.7);
    preset.textContent = keys[at];
  }

  function wake() {
    wrap.classList.remove('calm');
    clearTimeout(hide);
    hide = setTimeout(() => wrap.classList.add('calm'), 3000);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  }

  function close() {
    cancelAnimationFrame(raf);
    clearInterval(cycle);
    clearTimeout(hide);
    offChange();
    window.removeEventListener('resize', size);
    document.removeEventListener('keydown', onKey);
    try { viz?.disconnectAudio?.(bus); } catch { /* noop */ }
    if (analyser) try { bus.disconnect(analyser); } catch { /* noop */ }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    wrap.remove();
  }

  wrap.addEventListener('pointermove', wake);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', size);
  wake();
  size();

  try {
    if (!document.createElement('canvas').getContext('webgl2')) throw new Error('WebGL 2 not available');
    const { bc, presets: all } = await loadLib();
    if (!wrap.isConnected) return;
    presets = all;
    keys = shuffle(Object.keys(presets));
    viz = bc.createVisualizer(ctx, canvas, { width: canvas.width, height: canvas.height, pixelRatio: 1 });
    viz.connectAudio(bus);
    viz.loadPreset(presets[keys[0]], 0);
    preset.textContent = keys[0];
    const loop = () => { raf = requestAnimationFrame(loop); viz.render(); };
    loop();
    cycle = setInterval(() => { if (auto) step(1); }, CYCLE_MS);
  } catch (err) {
    console.warn('Visualizer fallback:', err);
    preset.textContent = 'Spectrum';
    bars();
  }

  function bars() {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    bus.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const g = canvas.getContext('2d');
    const loop = () => {
      raf = requestAnimationFrame(loop);
      analyser.getByteFrequencyData(data);
      const W = canvas.width, H = canvas.height, n = 48;
      g.fillStyle = '#16140f';
      g.fillRect(0, 0, W, H);
      const bw = W / n;
      for (let i = 0; i < n; i++) {
        const v = data[Math.floor((i / n) ** 1.6 * data.length)] / 255;
        const h = v * H * 0.8;
        g.fillStyle = i % 3 === 0 ? '#bd2f1c' : i % 3 === 1 ? '#e2a72e' : '#ece3cd';
        g.fillRect(i * bw + 2, H - h, bw - 4, h);
      }
    };
    loop();
  }
}
