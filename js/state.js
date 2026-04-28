// Persistent settings + transient run-time state.
// Settings are persisted to localStorage. Game state is in-memory.

const STORAGE_KEY = 'micdrop:settings:v1';

const DEFAULTS = {
  musicVolume: 0.7,
  sfxVolume: 0.5,
  sfxOn: true,
  reducedMotion: false,
  theme: 'dark',           // 'dark' | 'light'
  roundSeconds: 45,        // length of one bar trade
  showRhymeHint: true,     // show "use this word in your bars" hint
  drawCount: {
    crew: 2,               // burn-or-boast + rhyme
    koth: 3,               // burn-or-boast + 2 rhyme
  },
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); }
  catch { /* full or denied */ }
}

export const settings = {
  get(key) { return load()[key]; },
  set(key, value) { load()[key] = value; save(); applyTheme(); },
  all() { return { ...load() }; },
  reset() { cache = { ...DEFAULTS }; save(); applyTheme(); },
};

function applyTheme() {
  const theme = load().theme;
  document.documentElement.dataset.theme = theme;
}

// Run on import so the theme applies before first paint of dynamic UI.
applyTheme();

// Lightweight pub/sub for things that want to react (music player volume,
// SFX gate, etc).
const listeners = new Set();
export function onSettings(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export function emitSettings() { for (const cb of listeners) cb(settings.all()); }

// Run-time game state (cleared between sessions).
export const game = {
  mode: null,        // 'crew' | 'koth'
  crew: null,        // crew battle state
  koth: null,        // king-of-the-hill state
  reset() { this.mode = null; this.crew = null; this.koth = null; },
};
