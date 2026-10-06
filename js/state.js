// Persistent settings + transient run-time state.
// Settings are persisted to localStorage. Game state is in-memory.

const STORAGE_KEY = 'micdrop:settings:v1';

const DEFAULTS = {
  musicVolume: 0.7,
  sfxVolume: 0.6,
  sfxOn: true,
  reducedMotion: false,
  theme: 'paper',          // 'paper' | 'night'
  roundSeconds: 45,        // length of one verse
  showRhymeHint: true,     // show extra rhyming words on rhyme cards
  autoBeat: true,          // the bell drops a beat if nothing's playing
  twists: true,            // some bouts get a twist card
  crowdMeter: true,        // offer the mic-based crowd vote
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
  if (cache.theme !== 'paper' && cache.theme !== 'night') cache.theme = 'paper';   // old dark/light values
  return cache;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); }
  catch { /* full or denied */ }
}

export const settings = {
  get(key) { return load()[key]; },
  set(key, value) {
    load()[key] = value;
    save();
    if (key === 'theme') applyTheme();
    window.dispatchEvent(new CustomEvent('micdrop:settings', { detail: key }));
  },
  all() { return { ...load() }; },
  reset() { cache = { ...DEFAULTS }; save(); applyTheme(); window.dispatchEvent(new CustomEvent('micdrop:settings', { detail: '*' })); },
};

function applyTheme() {
  const theme = load().theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#16140f' : '#eee6d3');
}

// Run on import so the theme applies before first paint of dynamic UI.
applyTheme();

// Run-time game state (cleared between sessions).
export const game = {
  mode: null,        // 'crew' | 'koth'
  crew: null,        // crew battle state
  koth: null,        // king-of-the-hill state
  reset() { this.mode = null; this.crew = null; this.koth = null; },
};
