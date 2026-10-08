// Crowd meter: the room cheers for one rapper, then the other, and the
// microphone decides who got the louder reaction.

import { el, sleep } from './ui.js';
import { icon } from './icons.js';
import { isPlaying, pauseMusic, resumeMusic } from './mixer.js';
import { sfx } from './sfx.js';

const LISTEN_MS = 3500;

// sides: [{ name, color }, { name, color }]. Resolves { winner: 0 | 1 } or null (no decision).
export function crowdVote(sides) {
  return new Promise((resolve) => {
    let stream = null, actx = null, analyser = null, closed = false;
    const hadMusic = isPlaying();
    const scores = [0, 0];

    const body = el('div', { class: 'crowd-body' });
    const close = (result) => {
      if (closed) return;
      closed = true;
      stream?.getTracks().forEach((t) => t.stop());
      actx?.close().catch(() => {});
      wrap.remove();
      if (hadMusic) resumeMusic();
      resolve(result);
    };
    const wrap = el('div', { class: 'dialog-wrap' },
      el('div', { class: 'dialog crowd', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Crowd meter' },
        el('button', { class: 'btn icon closebtn', 'aria-label': 'Close', onClick: () => close(null) }, icon('close', 18)),
        el('p', { class: 'kicker' }, 'Crowd meter'),
        body));
    document.body.appendChild(wrap);

    const meters = sides.map((s) => {
      const fill = el('span', { class: 'meter-fill' });
      const val = el('span', { class: 'meter-val' }, '—');
      const row = el('div', { class: `meter ${s.color}` },
        el('span', { class: 'meter-name' }, s.name),
        el('span', { class: 'meter-track' }, fill), val);
      return { row, fill, val };
    });
    const setMeter = (i, score) => {
      meters[i].fill.style.width = `${score}%`;
      meters[i].val.textContent = Math.round(score);
    };

    function view(...nodes) { while (body.firstChild) body.firstChild.remove(); body.append(...nodes); }

    function intro() {
      view(
        el('h3', { class: 'crowd-title' }, 'Let the room decide'),
        el('p', {}, `Everybody cheers for ${sides[0].name}, then for ${sides[1].name}. The mic measures the noise. Loudest reaction wins.`),
        el('p', { class: 'fine' }, 'Your browser will ask to use the microphone. Nothing is recorded or sent anywhere.'),
        el('div', { class: 'btnrow end' },
          el('button', { class: 'btn', onClick: () => close(null) }, 'Judges decide'),
          el('button', { class: 'btn ink', onClick: begin }, icon('mic', 18), 'Start the meter')));
    }

    async function begin() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch {
        view(
          el('h3', { class: 'crowd-title' }, 'No microphone'),
          el('p', {}, 'The meter needs microphone access. Judges, you make the call.'),
          el('div', { class: 'btnrow end' }, el('button', { class: 'btn ink', onClick: () => close(null) }, 'OK')));
        return;
      }
      if (hadMusic) pauseMusic();
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      actx.createMediaStreamSource(stream).connect(analyser);
      await run();
    }

    async function run() {
      for (const i of [0, 1]) {
        if (closed) return;
        const big = el('div', { class: 'countdown' }, '3');
        view(
          el('h3', { class: `crowd-title ${sides[i].color}` }, `Make some noise for ${sides[i].name}!`),
          big, ...meters.map((m) => m.row));
        for (const n of ['3', '2', '1']) {
          big.textContent = n;
          sfx('tick');
          await sleep(700);
          if (closed) return;
        }
        big.textContent = 'NOW!';
        scores[i] = await listen(i);
        big.textContent = Math.round(scores[i]);
        await sleep(600);
      }
      result();
    }

    async function listen(i) {
      const buf = new Float32Array(analyser.fftSize);
      const levels = [];
      const end = performance.now() + LISTEN_MS;
      while (performance.now() < end && !closed) {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
        const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
        const score = Math.max(0, Math.min(100, ((db + 55) / 50) * 100));
        levels.push(score);
        setMeter(i, score);
        await new Promise((r) => requestAnimationFrame(r));
      }
      // Loudest quarter of the window, so one cough doesn't win and one breath doesn't lose.
      levels.sort((a, b) => b - a);
      const top = levels.slice(0, Math.max(1, Math.floor(levels.length / 4)));
      const s = top.reduce((a, b) => a + b, 0) / top.length;
      setMeter(i, s);
      return s;
    }

    function result() {
      const diff = scores[0] - scores[1];
      const winner = Math.abs(diff) < 4 ? null : diff > 0 ? 0 : 1;
      view(
        el('h3', { class: `crowd-title ${winner == null ? '' : sides[winner].color}` },
          winner == null ? 'Too close to call!' : `The room picks ${sides[winner].name}`),
        ...meters.map((m) => m.row),
        el('div', { class: 'btnrow end' },
          el('button', { class: 'btn', onClick: () => { scores[0] = scores[1] = 0; meters.forEach((_, k) => setMeter(k, 0)); run(); } }, 'Run it again'),
          winner == null
            ? el('button', { class: 'btn ink', onClick: () => close(null) }, 'Judges decide')
            : el('button', { class: `btn ${sides[winner].color}`, onClick: () => close({ winner }) }, `Give it to ${sides[winner].name}`)));
    }

    intro();
  });
}
