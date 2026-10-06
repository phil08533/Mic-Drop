// Music drawer: genre picker, two decks with a crossfader, auto-mix, tempo, track list.
// Audio engine lives in mixer.js. Reads music/manifest.json for genres + tracks.

import { el, clear, shuffle } from './ui.js';
import { settings } from './state.js';
import {
  mixer, getDecks, audioReady, isRunning, position, effBpm, currentFadeX,
  playTrack, mixTo, cueTrack, setCrossfade, setTempo, setVolume, togglePause, pickNext,
} from './mixer.js';

const drawer = document.getElementById('music-drawer');
const scrim = document.getElementById('scrim');

let manifest = null;
let genre = 'all';                // genre id, or 'all'
let shuffled = true;
let raf = 0;
let refs = {};                    // live DOM nodes updated every frame

mixer.volume = settings.get('musicVolume');
mixer.onChange = () => { if (isOpen()) refreshList(); };

const isOpen = () => drawer.getAttribute('aria-hidden') === 'false';

async function loadManifest() {
  if (manifest) return manifest;
  try {
    const res = await fetch('music/manifest.json', { cache: 'no-cache' });
    manifest = await res.json();
  } catch {
    manifest = { genres: [] };
  }
  for (const g of manifest.genres) for (const t of g.tracks || []) t.genre = g.id;
  return manifest;
}

export async function mountMusic() {
  await loadManifest();
  buildQueue();
  if (isOpen()) build();
}

export function openMusic() {
  drawer.setAttribute('aria-hidden', 'false');
  scrim.hidden = false;
  build();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

export function closeMusic() {
  drawer.setAttribute('aria-hidden', 'true');
  cancelAnimationFrame(raf);
  if (document.getElementById('settings-drawer')?.getAttribute('aria-hidden') !== 'false') {
    scrim.hidden = true;
  }
}

export function applyMusicVolume(v) { setVolume(v); }

// ---------- queue ----------
function genreTracks() {
  if (!manifest) return [];
  const gs = genre === 'all' ? manifest.genres : manifest.genres.filter((g) => g.id === genre);
  return gs.flatMap((g) => g.tracks || []);
}

function buildQueue() {
  const t = genreTracks();
  mixer.queue = shuffled ? shuffle(t) : t.slice().sort((a, b) => (a.bpm || 0) - (b.bpm || 0));
}

const same = (a, b) => a && b && a.file === b.file && a.genre === b.genre;
const liveTrack = () => (mixer.live != null ? getDecks()[mixer.live].track : null);
const fmtBpm = (n) => (n ? Math.round(n) : '—');

// ---------- actions ----------
function start() {
  const t = liveTrack() ? null : mixer.queue[0];
  if (t) playTrack(t).catch(fail);
  else togglePause();
  paint();
}
function mixNext() {
  const n = pickNext();
  if (n) playTrack(n).catch(fail);        // playTrack mixes if something is live
}
function fail(err) { console.warn('Music error', err); }
function selectGenre(id) {
  genre = id;
  buildQueue();
  build();
}
function toggleShuffle() { shuffled = !shuffled; buildQueue(); build(); }

// ---------- DOM ----------
function build() {
  clear(drawer);
  refs = { decks: [], rows: new Map() };

  drawer.appendChild(el('button', { class: 'closebtn', onClick: closeMusic, 'aria-label': 'Close music player' }, 'CLOSE'));
  drawer.appendChild(el('h2', {}, 'Beats'));
  const wrap = el('div', { class: 'mp' });

  // genre pills
  const genres = el('div', { class: 'genres' });
  if (!manifest?.genres?.length) {
    wrap.appendChild(el('p', { class: 'note' }, 'No genres configured. Add one in music/manifest.json.'));
  }
  for (const g of [{ id: 'all', name: 'All' }, ...(manifest?.genres || [])]) {
    genres.appendChild(el('button', {
      class: g.id === genre ? 'active' : '', onClick: () => selectGenre(g.id),
    }, g.name || g.id));
  }
  wrap.appendChild(genres);

  // two decks
  const decks = el('div', { class: 'decks' });
  getDecks().forEach((d, i) => {
    const r = {
      card: el('div', { class: 'deck' }),
      title: el('div', { class: 'title' }, '—'),
      meta: el('div', { class: 'meta' }, ''),
      bar: el('div', { class: 'progress-fill' }),
      dots: [0, 1, 2, 3].map(() => el('i', { class: 'beat' })),
    };
    r.card.append(
      el('div', { class: 'deck-id' }, `DECK ${d.id}`),
      r.title, r.meta,
      el('div', { class: 'progress' }, r.bar),
      el('div', { class: 'beats' }, ...r.dots),
    );
    refs.decks[i] = r;
    decks.appendChild(r.card);
  });
  wrap.appendChild(decks);

  // crossfader
  refs.xf = el('input', {
    type: 'range', min: 0, max: 1000, value: 0, class: 'xfader', 'aria-label': 'Crossfader',
    onInput: (e) => { if (audioReady()) setCrossfade(+e.target.value / 1000); },
  });
  refs.xfLabel = el('div', { class: 'xf-state' }, '');
  wrap.appendChild(el('div', { class: 'xf' },
    el('span', { class: 'xf-end' }, 'A'), refs.xf, el('span', { class: 'xf-end' }, 'B')));
  wrap.appendChild(refs.xfLabel);

  // transport
  refs.play = el('button', { class: 'iconbtn', onClick: start, 'aria-label': 'Play / pause' }, '▶');
  const autoBtn = el('button', {
    class: 'pill' + (mixer.auto ? ' on' : ''), 'aria-pressed': String(mixer.auto),
    title: 'Automatically blend into the next beat before this one ends',
    onClick: () => { mixer.auto = !mixer.auto; autoBtn.classList.toggle('on', mixer.auto); autoBtn.setAttribute('aria-pressed', String(mixer.auto)); },
  }, 'Auto-mix');
  const fade = el('select', {
    class: 'select', 'aria-label': 'Fade length',
    onChange: (e) => { mixer.fadeBars = +e.target.value; },
  }, ...[2, 4, 8, 16].map((n) => el('option', { value: n, ...(n === mixer.fadeBars ? { selected: '' } : {}) }, `${n} bar fade`)));
  const shuf = el('button', {
    class: 'iconbtn', onClick: toggleShuffle, 'aria-label': 'Shuffle', title: shuffled ? 'Shuffle on' : 'Sorted by BPM',
    style: { color: shuffled ? 'var(--hot)' : 'var(--cream)' },
  }, '🔀');
  wrap.appendChild(el('div', { class: 'controls' },
    el('div', { class: 'group' },
      refs.play,
      el('button', { class: 'iconbtn', onClick: mixNext, 'aria-label': 'Mix in next beat', title: 'Mix in the next beat' }, '⏭'),
      autoBtn),
    el('div', { class: 'group' }, fade, shuf)));

  // tempo
  refs.tempo = el('input', {
    type: 'range', min: 60, max: 160, step: 0.5, value: 90, 'aria-label': 'Tempo',
    onInput: (e) => { setTempo(+e.target.value); refs.tempoVal.textContent = `${Math.round(+e.target.value)} BPM`; },
  });
  refs.tempoVal = el('span', {}, '— BPM');
  wrap.appendChild(el('div', { class: 'vol' }, el('span', {}, 'Tempo'), refs.tempo, refs.tempoVal));

  // volume
  const vol = el('div', { class: 'vol' },
    el('span', {}, 'Vol'),
    el('input', {
      type: 'range', min: 0, max: 100, value: Math.round((settings.get('musicVolume') || 0) * 100),
      onInput: (e) => {
        const v = +e.target.value / 100;
        setVolume(v);
        settings.set('musicVolume', v);
        vol.querySelector('#volval').textContent = e.target.value + '%';
      },
    }),
    el('span', { id: 'volval' }, Math.round((settings.get('musicVolume') || 0) * 100) + '%'));
  wrap.appendChild(vol);

  // track list
  const list = el('div', { class: 'tracklist' });
  const tracks = mixer.queue;
  if (!tracks.length) {
    list.appendChild(el('div', { class: 'empty' },
      'No tracks here. Drop audio files into ', el('span', { class: 'kbd' }, 'music/<genre>/'),
      ' and list them in ', el('span', { class: 'kbd' }, 'music/manifest.json'), '.'));
  } else {
    const ul = el('ul');
    tracks.forEach((t) => {
      const li = el('li', { onClick: () => playTrack(t).catch(fail), title: 'Play / mix in' },
        el('span', { class: 'tname' }, t.title || t.file),
        el('span', { class: 'note' }, `${fmtBpm(t.bpm)} BPM`),
        el('button', {
          class: 'cue', title: 'Cue on the other deck, then use the crossfader',
          onClick: (e) => { e.stopPropagation(); cueTrack(t).catch(fail); },
        }, 'CUE'));
      refs.rows.set(t, li);
      ul.appendChild(li);
    });
    list.appendChild(ul);
  }
  wrap.appendChild(list);
  wrap.appendChild(el('p', { class: 'note' },
    'Tap a beat to mix it in on the next bar. Matching tempos are locked together; ',
    'CUE it to blend by hand with the crossfader.'));

  drawer.appendChild(wrap);
  paint();
}

function refreshList() { paint(); }

// per-frame + on-change updates (no DOM rebuild)
function frame() {
  paint();
  if (isOpen()) raf = requestAnimationFrame(frame);
}

function paint() {
  if (!refs.decks) return;
  const decks = getDecks();
  const running = audioReady() && isRunning();
  const live = liveTrack();
  refs.play.textContent = running && mixer.live != null ? '⏸' : '▶';

  decks.forEach((d, i) => {
    const r = refs.decks[i];
    if (!r) return;
    const on = !!d.src && !!d.track;
    const isLive = mixer.live === i;
    r.card.classList.toggle('live', on && isLive);
    r.card.classList.toggle('cued', on && !isLive);
    if (!on) {
      r.title.textContent = '—'; r.meta.textContent = 'empty';
      r.bar.style.width = '0%';
      r.dots.forEach((b) => b.classList.remove('on', 'down'));
      return;
    }
    r.title.textContent = d.track.title || d.track.file;
    r.meta.textContent = `${fmtBpm(effBpm(d))} BPM · ${d.synced ? 'SYNC' : 'FREE'}`;
    const p = position(d);
    const len = d.loopLen;
    r.bar.style.width = `${Math.max(0, Math.min(1, p / len)) * 100}%`;
    const barLen = d.track.bpm ? 240 / d.track.bpm : 0;
    const beat = barLen && p >= 0 ? Math.floor(((p % barLen) / barLen) * 4) : -1;
    r.dots.forEach((b, k) => {
      b.classList.toggle('on', k === beat);
      b.classList.toggle('down', k === beat && beat === 0);
    });
  });

  // crossfader follows the auto-fade; don't fight the user's finger
  if (audioReady() && document.activeElement !== refs.xf) refs.xf.value = Math.round(currentFadeX() * 1000);
  const f = mixer.fade;
  refs.xfLabel.textContent = f ? 'Mixing…' : mixer.live == null ? 'Pick a beat to start'
    : decks[1 - mixer.live].src ? 'Cued: slide the crossfader to blend' : (mixer.auto ? 'Auto-mix on' : 'Auto-mix off');

  // tempo slider tracks the live deck, ±8% around its native BPM
  if (live && live.bpm && document.activeElement !== refs.tempo) {
    refs.tempo.min = Math.min(live.bpm * 0.92, mixer.tempo).toFixed(1);
    refs.tempo.max = Math.max(live.bpm * 1.08, mixer.tempo).toFixed(1);
    refs.tempo.value = mixer.tempo;
    refs.tempoVal.textContent = `${Math.round(mixer.tempo)} BPM`;
  }

  // highlight rows
  for (const [t, li] of refs.rows) {
    li.classList.toggle('playing', same(t, live));
    li.classList.toggle('queued', !same(t, live) && decks.some((d) => same(d.track, t)));
  }
}
