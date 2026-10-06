// The background fire, shared by every screen. Battles turn it up as the clock
// runs down, and flare it when somebody wins.

import { createFire } from './fire.js';

let fire = null;
let base = 0.45;

export const stagefx = {
  mount(canvas, { palette, still }) {
    fire = createFire(canvas, { palette });
    fire.setHeat(base);
    if (still) fire.setStill(true); else fire.start();
  },
  // How tall the fire burns when nothing is happening on this screen.
  base(v) { base = v; fire?.setHeat(v); },
  heat(v) { fire?.setHeat(Math.max(base, v)); },
  calm() { fire?.setHeat(base); },
  flare(ms) { fire?.flare(ms); },
  palette(name) { fire?.setPalette(name); },
  still(v) { fire?.setStill(v); },
};
