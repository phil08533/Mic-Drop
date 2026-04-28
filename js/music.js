// Music player. Reads music/manifest.json which lists genres + tracks.
// If a genre has no tracks the UI shows a hint explaining where to drop files.

import { $, el, clear, shuffle } from './ui.js';
import { settings } from './state.js';

const drawer = document.getElementById('music-drawer');
const scrim = document.getElementById('scrim');

let manifest = null;
let state = {
  genre: null,
  queue: [],
  index: 0,
  shuffled: true,
  audio: null,
  playing: false,
};

const audio = new Audio();
audio.preload = 'auto';
state.audio = audio;
audio.volume = settings.get('musicVolume');

audio.addEventListener('ended', () => next());
audio.addEventListener('play',  () => { state.playing = true; renderInner(); });
audio.addEventListener('pause', () => { state.playing = false; renderInner(); });

async function loadManifest() {
  if (manifest) return manifest;
  try {
    const res = await fetch('music/manifest.json', { cache: 'no-cache' });
    manifest = await res.json();
  } catch {
    manifest = { genres: [] };
  }
  return manifest;
}

export async function mountMusic() {
  await loadManifest();
  // Default genre = first that has tracks, else first genre at all.
  const withTracks = manifest.genres.find((g) => g.tracks?.length);
  state.genre = (withTracks || manifest.genres[0])?.id || null;
  if (state.genre) buildQueue();
  renderInner();
}

export function openMusic() {
  drawer.setAttribute('aria-hidden', 'false');
  scrim.hidden = false;
  renderInner();
}

export function closeMusic() {
  drawer.setAttribute('aria-hidden', 'true');
  if (document.getElementById('settings-drawer')?.getAttribute('aria-hidden') !== 'false') {
    scrim.hidden = true;
  }
}

function currentGenre() {
  return manifest?.genres.find((g) => g.id === state.genre) || null;
}

function buildQueue() {
  const g = currentGenre();
  const tracks = g?.tracks || [];
  state.queue = state.shuffled ? shuffle(tracks) : tracks.slice();
  state.index = 0;
}

function currentTrack() {
  return state.queue[state.index] || null;
}

function play(track) {
  if (!track) return;
  const g = currentGenre();
  if (!g) return;
  const src = `music/${g.id}/${track.file || track}`;
  if (audio.src.endsWith(src)) {
    audio.play().catch(() => {});
    return;
  }
  audio.src = src;
  audio.play().catch(() => {});
}

function togglePlay() {
  if (!state.queue.length) return;
  if (audio.paused) {
    if (!audio.src) play(currentTrack());
    else audio.play().catch(() => {});
  } else {
    audio.pause();
  }
}

function next() {
  if (!state.queue.length) return;
  state.index = (state.index + 1) % state.queue.length;
  play(currentTrack());
}

function prev() {
  if (!state.queue.length) return;
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  play(currentTrack());
}

function selectGenre(id) {
  if (state.genre === id) return;
  state.genre = id;
  buildQueue();
  audio.pause();
  audio.removeAttribute('src');
  renderInner();
}

function selectTrack(idx) {
  state.index = idx;
  play(currentTrack());
}

function toggleShuffle() {
  state.shuffled = !state.shuffled;
  const t = currentTrack();
  buildQueue();
  if (t) state.index = state.queue.findIndex((x) => trackId(x) === trackId(t)) || 0;
  renderInner();
}

function trackId(t) { return typeof t === 'string' ? t : t.file; }
function trackTitle(t) { return typeof t === 'string' ? t : (t.title || t.file); }
function trackArtist(t) { return typeof t === 'string' ? '' : (t.artist || ''); }

function renderInner() {
  const open = drawer.getAttribute('aria-hidden') === 'false';
  if (!open) return;
  clear(drawer);
  drawer.appendChild(el('button', { class: 'closebtn', onClick: closeMusic, 'aria-label': 'Close music player' }, 'CLOSE'));
  drawer.appendChild(el('h2', {}, 'Music'));

  const wrap = el('div', { class: 'mp' });
  const g = currentGenre();
  const t = currentTrack();

  // Genre pills
  const genres = el('div', { class: 'genres' });
  if (!manifest?.genres?.length) {
    wrap.appendChild(el('p', { class: 'note' }, 'No genres configured. Add one in music/manifest.json.'));
  } else {
    for (const gen of manifest.genres) {
      const btn = el('button', {
        class: gen.id === state.genre ? 'active' : '',
        onClick: () => selectGenre(gen.id),
      }, gen.name || gen.id);
      genres.appendChild(btn);
    }
  }
  wrap.appendChild(genres);

  // Now playing
  const now = el('div', { class: 'now' });
  if (t) {
    now.appendChild(el('div', { class: 'title' }, trackTitle(t)));
    const meta = trackArtist(t) ? `${g.name || g.id} · ${trackArtist(t)}` : (g.name || g.id);
    now.appendChild(el('div', { class: 'meta' }, meta));
  } else {
    now.appendChild(el('div', { class: 'title' }, '—'));
    now.appendChild(el('div', { class: 'meta' }, g ? `Empty · ${g.name || g.id}` : 'No genre'));
  }
  wrap.appendChild(now);

  // Controls
  const ctrls = el('div', { class: 'controls' });
  const left = el('div', { class: 'group' },
    el('button', { class: 'iconbtn', onClick: prev, 'aria-label': 'Previous' }, '⏮'),
    el('button', { class: 'iconbtn', onClick: togglePlay, 'aria-label': 'Play/Pause' }, state.playing ? '⏸' : '▶'),
    el('button', { class: 'iconbtn', onClick: next, 'aria-label': 'Next' }, '⏭'),
  );
  const right = el('button', {
    class: 'iconbtn',
    onClick: toggleShuffle,
    'aria-label': 'Shuffle',
    title: state.shuffled ? 'Shuffle on' : 'Shuffle off',
    style: { color: state.shuffled ? 'var(--hot)' : 'var(--cream)' },
  }, '🔀');
  ctrls.append(left, right);
  wrap.appendChild(ctrls);

  // Volume
  const vol = el('div', { class: 'vol' },
    el('span', {}, 'Vol'),
    el('input', {
      type: 'range', min: 0, max: 100, value: Math.round((settings.get('musicVolume') || 0) * 100),
      onInput: (e) => {
        const v = +e.target.value / 100;
        audio.volume = v;
        settings.set('musicVolume', v);
      },
    }),
    el('span', { id: 'volval' }, Math.round((settings.get('musicVolume') || 0) * 100) + '%'),
  );
  vol.querySelector('input').addEventListener('input', (e) => {
    vol.querySelector('#volval').textContent = e.target.value + '%';
  });
  wrap.appendChild(vol);

  // Tracklist
  const list = el('div', { class: 'tracklist' });
  if (!g) {
    list.appendChild(el('div', { class: 'empty' }, 'No genre selected.'));
  } else if (!state.queue.length) {
    list.appendChild(el('div', { class: 'empty' },
      `No tracks in ${g.name || g.id}. Drop audio files into `,
      el('span', { class: 'kbd' }, `music/${g.id}/`),
      ' and add them to ',
      el('span', { class: 'kbd' }, 'music/manifest.json'),
      '.',
    ));
  } else {
    const ul = el('ul');
    state.queue.forEach((trk, i) => {
      const li = el('li', {
        class: i === state.index ? 'playing' : '',
        onClick: () => selectTrack(i),
      },
        el('span', {}, trackTitle(trk)),
        el('span', { class: 'note' }, trackArtist(trk) || ''),
      );
      ul.appendChild(li);
    });
    list.appendChild(ul);
  }
  wrap.appendChild(list);

  drawer.appendChild(wrap);
}

// Re-apply volume when settings change.
export function applyMusicVolume(v) {
  audio.volume = v;
}
