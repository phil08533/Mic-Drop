// Card deck loading + draw logic.
// Decks are loaded once, cached in memory, and drawn from
// reshuffling pools so a card is never repeated until the
// pool is exhausted.

import { shuffle } from './ui.js';

const DATA = {
  burns: 'data/burns.json',
  boasts: 'data/boasts.json',
  rhymes: 'data/rhymes.json',
  twists: 'data/twists.json',
};

let decks = null;
const pools = { burns: [], boasts: [], rhymes: [], twists: [] };

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function loadDecks() {
  if (decks) return decks;
  const [burns, boasts, rhymes, twists] = await Promise.all([
    loadJson(DATA.burns),
    loadJson(DATA.boasts),
    loadJson(DATA.rhymes),
    loadJson(DATA.twists).catch(() => ({ cards: [] })),
  ]);
  decks = {
    burns: burns.cards.map((text, i) => ({ id: `burn-${i}`, kind: 'burn', text })),
    boasts: boasts.cards.map((text, i) => ({ id: `boast-${i}`, kind: 'boast', text })),
    rhymes: rhymes.cards.map((c, i) => ({ id: `rhyme-${i}`, kind: 'rhyme', anchor: c.anchor, words: c.words })),
    twists: twists.cards.map((c, i) => ({ id: `twist-${i}`, kind: 'twist', ...(typeof c === 'string' ? { text: c } : c) })),
  };
  for (const k of Object.keys(pools)) refill(k);
  return decks;
}

function refill(which) {
  pools[which] = shuffle(decks[which]);
}

function drawFrom(which) {
  if (!decks) throw new Error('Decks not loaded yet');
  if (pools[which].length === 0) refill(which);
  // copy so a card's flipped state belongs to this hand only
  return { ...pools[which].pop() };
}

// A "prompt" card: 50/50 burn or boast.
export function drawPrompt() {
  return drawFrom(Math.random() < 0.5 ? 'burns' : 'boasts');
}

export function drawRhyme() {
  return drawFrom('rhymes');
}

// Crew battle hand: prompt + rhyme. King of the Hill: prompt + two rhymes.
export function drawHandCrew() { return [drawPrompt(), drawRhyme()]; }
export function drawHandKoth() { return [drawPrompt(), drawRhyme(), drawRhyme()]; }

// About one bout in three gets a twist both rappers have to follow.
export function maybeTwist(chance = 0.34) {
  if (!decks?.twists.length || Math.random() > chance) return null;
  return drawFrom('twists');
}

export function ready() { return !!decks; }
