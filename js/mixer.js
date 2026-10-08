// Two-deck beat mixer on Web Audio. No DOM in here — music.js is the UI.
//
// Tracks that declare `bpm` (and are whole bars long with the first downbeat at
// 0:00) get beat-matched: the incoming deck's playbackRate is set so its tempo
// equals the current tempo (also trying half/double-time), and it is started on
// a bar line of the live deck. Tracks that can't be matched within a few
// percent are blended "free" and the tempo jumps to the new track.
//
// Graph: deck gains -> bus (ducking) -> master (volume) -> speakers.
// The Beat Lab and the visualizer hang off the same bus via audio().

const TOL_LO = 0.88;
const TOL_HI = 1.14;

const decks = [mkDeck('A'), mkDeck('B')];
let ctx = null;
let bus = null;
let master = null;
let paused = false;
const cache = new Map();
const listeners = new Set();

export const mixer = {
  volume: 0.7,
  tempo: 0,          // BPM the live deck is running at
  fadeBars: 4,
  auto: false,
  live: null,        // index of the deck currently "on air", null when stopped
  xfade: 0,          // 0 = deck A only, 1 = deck B only
  fade: null,        // running auto-fade {o, i, t0, t1, x0, x1}
  queue: [],         // tracks auto-mix / "next" draw from
  hold: false,       // someone is mid-verse: auto-mix keeps the current beat looping
  minPlay: 60,       // auto-mix lets every beat play at least this many seconds
};

function mkDeck(id) {
  return { id, track: null, buffer: null, src: null, gain: null, startedAt: 0, rate: 1, synced: true, loopLen: 1, pausedAt: null };
}

export const getDecks = () => decks;
export const audioReady = () => !!ctx;
export const isPlaying = () => !!ctx && mixer.live != null && !!decks[mixer.live].buffer && !paused;
export const isPaused = () => paused;
export function onMixerChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function emit() { for (const cb of listeners) { try { cb(); } catch (e) { console.warn(e); } } }

// The shared AudioContext and the music bus. Creating it needs a user gesture.
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = mixer.volume;
    master.connect(ctx.destination);
    bus = ctx.createGain();
    bus.connect(master);
    for (const d of decks) {
      d.gain = ctx.createGain();
      d.gain.gain.value = 0;
      d.gain.connect(bus);
    }
    applyGains(mixer.xfade, 0);
    setInterval(tick, 200);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return { ctx, bus, master };
}

// Let other audio (the Beat Lab) know the mixer just took over, and vice versa.
function claim() { window.dispatchEvent(new CustomEvent('micdrop:audio', { detail: 'mixer' })); }
window.addEventListener('micdrop:audio', (e) => { if (e.detail !== 'mixer') stopAll(); });

const trackKey = (t) => t.key || `${t.genre}/${t.file}`;

function load(track) {
  const key = trackKey(track);
  if (!cache.has(key)) {
    const p = track.render
      ? track.render(ctx)                                     // made in the Beat Lab
      : fetch(`music/${track.genre}/${track.file}`).then((r) => {
        if (!r.ok) throw new Error(`${track.file}: ${r.status}`);
        return r.arrayBuffer();
      }).then((b) => ctx.decodeAudioData(b));
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return cache.get(key);
}

// ---------- timing helpers ----------
const barSecs = (track) => 240 / (track.bpm || 60);          // in track seconds

// MP3 encoders pad the file a little; trust bars+bpm over the file length when we have them.
const loopLen = (track, buffer) =>
  track.bars && track.bpm ? Math.min(buffer.duration, track.bars * barSecs(track)) : buffer.duration;

export function effBpm(d) { return d.track ? (d.track.bpm || 0) * d.rate : 0; }

export function position(d) {                                // seconds into the file
  if (d.pausedAt != null) return d.pausedAt;
  if (!d.src) return 0;
  const t = (ctx.currentTime - d.startedAt) * d.rate;
  return t < 0 ? t : t % d.loopLen;
}

function rateFor(track, tempo) {
  if (!track.bpm || !tempo) return { rate: 1, synced: false };
  for (const k of [1, 2, 0.5]) {                              // straight, double- or half-time
    const r = (tempo * k) / track.bpm;
    if (r >= TOL_LO && r <= TOL_HI) return { rate: r, synced: true };
  }
  return { rate: 1, synced: false };
}

function setRate(d, rate) {
  const now = ctx.currentTime;
  const p = position(d);
  d.rate = rate;
  d.src.playbackRate.setValueAtTime(rate, now);
  d.startedAt = now - p / rate;
}

function gainsFor(x) {
  return [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];  // equal-power
}

function applyGains(x, glide = 0.015) {
  const now = ctx.currentTime;
  const g = gainsFor(x);
  decks.forEach((d, i) => {
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setTargetAtTime(g[i], now, glide || 0.001);
  });
}

function makeSource(d, rate) {
  const s = ctx.createBufferSource();
  s.buffer = d.buffer;
  s.loop = true;                                              // tracks are whole bars, so it never runs dry
  s.loopStart = 0;
  s.loopEnd = d.loopLen;
  s.playbackRate.value = rate;
  s.connect(d.gain);
  return s;
}

function startDeck(d, track, buffer, when, rate, synced) {
  killDeck(d);
  Object.assign(d, { track, buffer, loopLen: loopLen(track, buffer), startedAt: when, playedFrom: when, rate, synced, pausedAt: null });
  d.src = makeSource(d, rate);
  d.src.start(when);
}

function stopSource(d, at = 0) {
  if (!d.src) return;
  const s = d.src;
  try { s.stop(at || ctx.currentTime); } catch { /* already stopped */ }
  setTimeout(() => { try { s.disconnect(); } catch { /* noop */ } }, 300 + Math.max(0, (at - ctx.currentTime)) * 1000);
  d.src = null;
}

function killDeck(d, at = 0) {
  stopSource(d, at);
  Object.assign(d, { track: null, buffer: null, pausedAt: null });
}

function nextBarTime(d, minAhead = 0.12) {
  const bar = barSecs(d.track);
  const p = position(d);
  const need = p + minAhead * d.rate;
  const nextBar = Math.ceil(need / bar) * bar;
  return ctx.currentTime + (nextBar - p) / d.rate;
}

export function fadeSeconds(d) {
  return (mixer.fadeBars * 240) / (effBpm(d) || 90);
}

// ---------- public API ----------
export async function playTrack(track) {
  audio();
  if (paused) resume();
  const buf = await load(track);
  claim();
  if (mixer.live != null && decks[mixer.live].src) return mixTo(track, 'bar', buf);
  cancelFade();
  const idx = mixer.live ?? 0;
  mixer.live = idx;
  mixer.tempo = track.bpm || 0;
  mixer.xfade = idx;
  applyGains(mixer.xfade, 0);
  startDeck(decks[idx], track, buf, ctx.currentTime + 0.05, 1, true);
  emit();
}

// Bring `track` in on the idle deck and fade to it. mode 'bar' = at the next bar line,
// 'end' = time it so the fade finishes exactly as the live track's loop ends.
export async function mixTo(track, mode = 'bar', preloaded) {
  audio();
  const buf = preloaded || await load(track);
  if (mixer.live == null || !decks[mixer.live].src) return playTrack(track);
  const o = mixer.live, i = 1 - o;
  const live = decks[o], inc = decks[i];
  cancelFade();

  const { rate, synced } = rateFor(track, mixer.tempo);
  const fadeDur = fadeSeconds(live);
  const now = ctx.currentTime;
  let t0 = nextBarTime(live);
  if (mode === 'end') {
    const end = now + (live.loopLen - position(live)) / live.rate;
    if (end - fadeDur > now + 0.2) t0 = end - fadeDur;
  }
  startDeck(inc, track, buf, t0, rate, synced);

  const x0 = mixer.xfade, x1 = i;                            // fade toward the idle deck's end of the slider
  const N = 96, ca = new Float32Array(N), cb = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const g = gainsFor(x0 + (x1 - x0) * (k / (N - 1)));
    ca[k] = g[0]; cb[k] = g[1];
  }
  const g0 = gainsFor(x0);
  [ca, cb].forEach((curve, n) => {
    const p = decks[n].gain.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(g0[n], now);
    p.setValueAtTime(g0[n], t0);
    p.setValueCurveAtTime(curve, t0, fadeDur);
  });
  live.src.stop(t0 + fadeDur + 0.1);
  mixer.fade = { o, i, t0, t1: t0 + fadeDur, x0, x1 };
  emit();
}

// Start `track` on the idle deck, silent, locked to the live deck's bar line, so the
// crossfader can be used by hand.
export async function cueTrack(track) {
  audio();
  const buf = await load(track);
  if (mixer.live == null || !decks[mixer.live].src) return playTrack(track);
  if (mixer.fade) return;
  const i = 1 - mixer.live;
  const { rate, synced } = rateFor(track, mixer.tempo);
  startDeck(decks[i], track, buf, nextBarTime(decks[mixer.live]), rate, synced);
  emit();
}

function cancelFade() {
  if (!mixer.fade) return;
  const now = ctx.currentTime;
  const f = mixer.fade;
  mixer.xfade = currentFadeX();
  mixer.fade = null;
  applyGains(mixer.xfade, 0.02);                             // hold where the curve got to
  // A scheduled stop() can't be cancelled, so swap the outgoing deck for a fresh source.
  const d = decks[f.o];
  if (d.src) {
    const p = position(d);
    const s = makeSource(d, d.rate);
    s.start(now, Math.max(0, p));
    try { d.src.stop(now); } catch { /* noop */ }
    d.src = s; d.startedAt = now - p / d.rate;
  }
}

export function currentFadeX() {
  const f = mixer.fade;
  if (!f || !ctx) return mixer.xfade;
  const p = Math.min(1, Math.max(0, (ctx.currentTime - f.t0) / (f.t1 - f.t0)));
  return f.x0 + (f.x1 - f.x0) * p;
}

// Manual crossfader (0..1). Takes over from any running auto-fade.
export function setCrossfade(x) {
  if (!ctx) return;
  if (mixer.fade) cancelFade();
  mixer.xfade = x;
  applyGains(x);
}

export function setTempo(bpm) {
  if (!ctx) return;
  mixer.tempo = bpm;
  decks.forEach((d) => {
    if (!d.src || !d.track?.bpm) return;
    const r = rateFor(d.track, bpm);
    if (r.synced) setRate(d, r.rate);
  });
}

export function setVolume(v) {
  mixer.volume = v;
  if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}

// Turn the beat down (e.g. while the crowd is cheering) without touching the volume setting.
export function duck(level = 0.3, secs = 0.4) {
  if (!bus) return;
  bus.gain.setTargetAtTime(level, ctx.currentTime, secs / 3);
}

function pause() {
  if (paused || mixer.live == null) return;
  cancelFade();
  for (const d of decks) {
    if (!d.src) continue;
    d.pausedAt = Math.max(0, position(d));
    stopSource(d);
  }
  paused = true;
  emit();
}

function resume() {
  if (!paused) return;
  const when = ctx.currentTime + 0.03;
  for (const d of decks) {
    if (!d.buffer || d.pausedAt == null) continue;
    const p = d.pausedAt % d.loopLen;
    d.src = makeSource(d, d.rate);
    d.src.start(when, p);
    d.startedAt = when - p / d.rate;
    d.pausedAt = null;
  }
  paused = false;
  claim();
  emit();
}

export function togglePause() {
  if (!ctx) return;
  if (paused) resume(); else pause();
}
export function pauseMusic() { if (ctx) pause(); }
export function resumeMusic() { if (ctx) resume(); }

export function stopAll() {
  if (!ctx) return;
  mixer.fade = null;
  decks.forEach((d) => killDeck(d));
  mixer.live = null;
  paused = false;
  emit();
}

// DJ "pull up": the beat winds down like a stopped turntable, then restarts from the top.
export function pullUp() {
  if (!isPlaying()) return false;
  cancelFade();
  const d = decks[mixer.live];
  const other = decks[1 - mixer.live];
  if (other.src) killDeck(other);
  const now = ctx.currentTime;
  d.src.playbackRate.cancelScheduledValues(now);
  d.src.playbackRate.setValueAtTime(d.rate, now);
  d.src.playbackRate.linearRampToValueAtTime(0.04, now + 0.7);
  const { track, buffer, rate, synced } = d;
  setTimeout(() => {
    if (decks[mixer.live] !== d || d.track !== track) return;
    startDeck(d, track, buffer, ctx.currentTime + 0.05, rate, synced);
    emit();
  }, 1150);
  return true;
}

export function pickNext() {
  const q = mixer.queue;
  if (!q.length) return null;
  const cur = mixer.live != null ? decks[mixer.live].track : null;
  const at = cur ? q.findIndex((t) => trackKey(t) === trackKey(cur)) : -1;
  return q[(at + 1) % q.length];
}

export function nowPlaying() {
  return mixer.live != null ? decks[mixer.live].track : null;
}

// ---------- housekeeping (runs even when the drawer is closed) ----------
function tick() {
  if (!ctx || paused) return;
  const now = ctx.currentTime;
  const f = mixer.fade;

  if (f && now >= f.t1) {                                    // auto-fade finished
    mixer.fade = null;
    mixer.live = f.i;
    mixer.xfade = f.x1;
    killDeck(decks[f.o]);
    decks[f.o].gain.gain.cancelScheduledValues(now);
    applyGains(mixer.xfade, 0.01);
    mixer.tempo = effBpm(decks[f.i]) || mixer.tempo;
    emit();
  } else if (!f && mixer.live != null) {
    // Manual mix: once the slider has fully committed to the other deck, hand over.
    const other = 1 - mixer.live;
    if (decks[other].src && Math.abs(mixer.xfade - other) < 0.03) {
      killDeck(decks[mixer.live]);
      mixer.live = other;
      mixer.tempo = effBpm(decks[other]) || mixer.tempo;
      emit();
    }
  }

  // Auto-mix: line up the next track so the fade ends as the current one loops.
  // Never while someone is rapping, and not before the beat has had its minute:
  // short beats (like Beat Lab loops) just keep repeating until then.
  if (mixer.auto && !mixer.hold && !mixer.fade && mixer.live != null) {
    const live = decks[mixer.live];
    const idle = decks[1 - mixer.live];
    if (live.src && !idle.src) {
      const remain = (live.loopLen - position(live)) / live.rate;
      const playedBy = now - (live.playedFrom ?? now) + remain;   // seconds played when this loop ends
      if (remain <= fadeSeconds(live) + 2.5 && playedBy >= mixer.minPlay) {
        const nxt = pickNext();
        if (nxt) mixTo(nxt, 'end').catch(() => {});
      }
    }
  }
}
