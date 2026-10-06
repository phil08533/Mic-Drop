// Fire along the bottom of the page.
//
// Flames are built from heat blobs: each one rises from the bottom, wobbles and
// shrinks to nothing. Blobs are added together on a small offscreen canvas, so a
// cluster of them leaving the same spot sums into a teardrop with a pointed tip —
// a flame tongue. The summed heat is then printed with five flat inks instead of
// a gradient, which gives the fire a screen-printed look.
//
// Blobs leave from a handful of "roots" that wander along the bottom and swell
// and fade on their own, so tongues split, merge and flicker like a real fire.
//
// API: setHeat(0..1) sets how tall the flames burn, flare() gives a short burst.

const CELL = 4;             // CSS pixels per simulation cell
const FPS = 30;

// [lowest summed heat (0-255) that gets this ink, colour]. Below the first: clear.
// On paper the hottest ink is a strong yellow; a pale core would read as a hole.
const INKS = {
  paper: [[40, '#7a1a0e'], [72, '#bd2f1c'], [125, '#dd6226'], [185, '#eda132'], [236, '#f6cd4c']],
  night: [[40, '#7a1a0e'], [72, '#bd2f1c'], [125, '#dd6226'], [185, '#eca936'], [236, '#f6e2a8']],
};

function buildLut(inks) {
  const lut = new Uint32Array(256);
  const le = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  for (let i = 0; i < 256; i++) {
    let hex = null;
    for (const [from, c] of inks) if (i >= from) hex = c;
    if (!hex) continue;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    lut[i] = le ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
  }
  return lut;
}

function buildSprite() {
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.75)');
  grad.addColorStop(0.7, 'rgba(255,255,255,.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return s;
}

export function createFire(canvas, { palette = 'paper' } = {}) {
  const out = canvas.getContext('2d');
  const heatCanvas = document.createElement('canvas');
  const hc = heatCanvas.getContext('2d', { willReadFrequently: true });
  let lut = buildLut(INKS[palette] || INKS.paper);
  const sprite = buildSprite();
  let W = 0, H = 0, img = null, px = null;
  let roots = [], blobs = [];
  let level = 0, target = 0.5, flareUntil = 0;
  let t = 0, running = false, raf = 0, last = 0, still = false;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(32, Math.ceil(r.width / CELL));
    const h = Math.max(16, Math.ceil(r.height / CELL));
    if (w === W && h === H) return false;
    W = w; H = h;
    canvas.width = heatCanvas.width = W;
    canvas.height = heatCanvas.height = H;
    img = out.createImageData(W, H);
    px = new Uint32Array(img.data.buffer);
    // one root per ~26 cells (~100px)
    const n = Math.max(4, Math.round(W / 26));
    roots = Array.from({ length: n }, (_, i) => ({
      home: (i + 0.5) * (W / n),
      phase: Math.random() * 100,
      speed: 0.6 + Math.random() * 0.8,
    }));
    blobs = [];
    return true;
  }

  function spawn(dt) {
    for (const r of roots) {
      // Each root breathes on its own, so tongues rise and fall out of step.
      const breathe = 0.55 + 0.45 * Math.sin(t * r.speed * 1.7 + r.phase) * Math.sin(t * r.speed * 0.6 + r.phase * 2);
      const x0 = r.home + Math.sin(t * r.speed * 0.5 + r.phase) * (W / roots.length) * 0.35;
      const rate = 70 * level * (0.4 + 0.6 * breathe);          // blobs per second from this root
      let k = rate * dt;
      while (k > 0) {
        if (k < 1 && Math.random() > k) break;
        k -= 1;
        const life = (0.55 + Math.random() * 0.45) * (0.75 + 0.5 * breathe);
        const rise = H * (0.3 + 1.05 * level) * (0.7 + 0.45 * breathe);  // how far it would get; it burns out sooner
        const size = H * (0.075 + Math.random() * 0.045) * (0.65 + 0.5 * level);
        blobs.push({
          x: x0 + (Math.random() + Math.random() - 1) * size * 0.9,
          y: H + size * 0.2,
          vy: -rise / life,
          size, life, age: 0,
          wob: (Math.random() - 0.5) * size * 0.9,
          wf: 3 + Math.random() * 4,
          ph: Math.random() * 6.28,
        });
      }
    }
  }

  function step(dt) {
    t += dt;
    spawn(dt);
    hc.globalCompositeOperation = 'source-over';
    hc.fillStyle = '#000';
    hc.fillRect(0, 0, W, H);
    // a low bed of embers so the base never has gaps
    const bed = H * (0.05 + 0.1 * level);
    const g = hc.createLinearGradient(0, H, 0, H - bed);
    g.addColorStop(0, `rgba(255,255,255,${0.95 * Math.min(1, level * 1.6)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    hc.fillStyle = g;
    hc.fillRect(0, H - bed, W, bed);

    hc.globalCompositeOperation = 'lighter';
    const draft = Math.sin(t * 0.45) * 0.6 + Math.sin(t * 1.3) * 0.25;
    const alive = [];
    for (const b of blobs) {
      b.age += dt;
      const u = b.age / b.life;
      if (u >= 1) continue;
      alive.push(b);
      b.y += b.vy * dt;
      // wobble grows as it rises, and the whole fire leans a little in the draft
      const x = b.x + Math.sin(b.ph + b.age * b.wf) * b.wob * u + draft * u * (H - b.y) * 0.08;
      const s = b.size * (1 - u) ** 1.1;
      hc.globalAlpha = 0.42 * (1 - u * 0.5);
      hc.drawImage(sprite, x - s, b.y - s * 1.5, s * 2, s * 3);
    }
    blobs = alive;
    hc.globalAlpha = 1;
  }

  function draw() {
    const heat = hc.getImageData(0, 0, W, H).data;
    for (let i = 0, j = 0; i < px.length; i++, j += 4) px[i] = lut[heat[j]];
    out.putImageData(img, 0, 0);
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / FPS - 2) return;
    last = now;
    const goal = now < flareUntil ? 1 : target;
    level += (goal - level) * (goal > level ? 0.08 : 0.03);
    step(1 / FPS);
    draw();
  }

  function settle() {
    // Reduced motion: let it burn for a moment off-screen, then hold that frame.
    level = target;
    for (let i = 0; i < FPS * 2; i++) step(1 / FPS);
    draw();
  }

  const api = {
    start() {
      resize();
      if (still) { settle(); return; }
      if (running) return;
      running = true; last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    setHeat(v) {
      target = Math.max(0, Math.min(1, v));
      if (still) settle();
    },
    flare(ms = 1800) { flareUntil = performance.now() + ms; },
    setPalette(name) {
      lut = buildLut(INKS[name] || INKS.paper);
      if (still) draw();
    },
    setStill(v) {
      still = v;
      if (still) { api.stop(); resize(); settle(); } else api.start();
    },
  };

  window.addEventListener('resize', () => { if (resize() && still) settle(); });
  return api;
}
