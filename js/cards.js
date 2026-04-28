// Card deck loading + draw logic.
// Decks are loaded once, cached in memory, and drawn from
// reshuffling pools so a card is never repeated until the
// pool is exhausted.

import { shuffle } from './ui.js';

const DATA = {
  burns: 'data/burns.json',
  boasts: 'data/boasts.json',
  rhymes: 'data/rhymes.json',
};

let decks = null;
let pools = { burns: [], boasts: [], rhymes: [] };

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function loadDecks() {
  if (decks) return decks;
  const [burns, boasts, rhymes] = await Promise.all([
    loadJson(DATA.burns),
    loadJson(DATA.boasts),
    loadJson(DATA.rhymes),
  ]);
  decks = {
    burns: burns.cards.map((text, i) => ({ id: `burn-${i}`, kind: 'burn', text })),
    boasts: boasts.cards.map((text, i) => ({ id: `boast-${i}`, kind: 'boast', text })),
    rhymes: rhymes.cards.map((c, i) => ({ id: `rhyme-${i}`, kind: 'rhyme', anchor: c.anchor, words: c.words })),
  };
  refill('burns'); refill('boasts'); refill('rhymes');
  return decks;
}

function refill(which) {
  pools[which] = shuffle(decks[which]);
}

// Draw a "prompt" card (50/50 burn or boast).
export function drawPrompt() {
  const pickBurn = Math.random() < 0.5;
  return drawFrom(pickBurn ? 'burns' : 'boasts');
}

// Draw a single rhyme card.
export function drawRhyme() {
  return drawFrom('rhymes');
}

function drawFrom(which) {
  if (!decks) throw new Error('Decks not loaded yet');
  if (pools[which].length === 0) refill(which);
  return pools[which].pop();
}

// For King of the Hill we draw a small hand of 3 cards:
// 1 prompt (burn/boast) + 2 rhymes.
export function drawHandKoth() {
  return [drawPrompt(), drawRhyme(), drawRhyme()];
}

// For crew battle we draw 2 cards: 1 prompt + 1 rhyme.
export function drawHandCrew() {
  return [drawPrompt(), drawRhyme()];
}

export function ready() { return !!decks; }
