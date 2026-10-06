// Settings drawer.

import { el, clear, ask } from './ui.js';
import { icon } from './icons.js';
import { settings } from './state.js';
import { applyMusicVolume } from './music.js';

const drawer = document.getElementById('settings-drawer');
const scrim = document.getElementById('scrim');
const musicDrawer = document.getElementById('music-drawer');

export function mountSettings() { /* render-on-open */ }

export function openSettings() {
  drawer.setAttribute('aria-hidden', 'false');
  scrim.hidden = false;
  render();
}

export function closeSettings() {
  drawer.setAttribute('aria-hidden', 'true');
  if (musicDrawer.getAttribute('aria-hidden') !== 'false') scrim.hidden = true;
}

function row(label, desc, control) {
  return el('div', { class: 'set-row' },
    el('div', {}, el('div', { class: 'set-label' }, label), el('div', { class: 'fine' }, desc)),
    control);
}

function toggle(key, onchange) {
  const input = el('input', { type: 'checkbox', role: 'switch' });
  input.checked = !!settings.get(key);
  input.addEventListener('change', () => { settings.set(key, input.checked); onchange?.(input.checked); });
  return el('label', { class: 'switch' }, input, el('span', { class: 'switch-track', 'aria-hidden': 'true' }));
}

function slider(key, onchange) {
  const v = Math.round(settings.get(key) * 100);
  const val = el('span', { class: 'val' }, `${v}%`);
  const range = el('input', { type: 'range', min: 0, max: 100, value: v, onInput: (e) => {
    val.textContent = `${e.target.value}%`;
    settings.set(key, +e.target.value / 100);
    onchange?.(+e.target.value / 100);
  } });
  return el('div', { class: 'set-slider' }, range, val);
}

function select(key, options, cast = String) {
  const s = el('select', { class: 'select' }, ...options.map(([v, label]) => el('option', { value: v }, label)));
  s.value = String(settings.get(key));
  s.addEventListener('change', () => settings.set(key, cast(s.value)));
  return s;
}

function render() {
  if (drawer.getAttribute('aria-hidden') !== 'false') return;
  clear(drawer);
  drawer.appendChild(el('div', { class: 'drawer-head' },
    el('h2', {}, 'Settings'),
    el('button', { class: 'btn small icon', onClick: closeSettings, 'aria-label': 'Close settings' }, icon('close', 16))));

  const wrap = el('div', { class: 'settings' },
    el('h3', { class: 'set-group' }, 'The battle'),
    row('Verse length', 'How long each rapper gets on the clock.',
      select('roundSeconds', [[30, '30 seconds'], [45, '45 seconds'], [60, '1 minute'], [90, '90 seconds'], [120, '2 minutes']], Number)),
    row('Beat drops with the bell', 'Starts a beat when the clock starts, if nothing is playing.', toggle('autoBeat')),
    row('Twist cards', 'About one bout in three gets a rule both rappers follow.', toggle('twists')),
    row('Crowd meter', 'Let the room cheer and the mic pick the winner.', toggle('crowdMeter')),
    row('Rhyme hints', 'Show a few rhyming words on rhyme cards.', toggle('showRhymeHint')),

    el('h3', { class: 'set-group' }, 'Sound'),
    row('Music volume', 'Beats and the Beat Lab.', slider('musicVolume', applyMusicVolume)),
    row('Sound effects', 'Bell, buzzer, air horn, card flips.', toggle('sfxOn')),
    row('Effects volume', '', slider('sfxVolume')),

    el('h3', { class: 'set-group' }, 'Look'),
    row('Theme', 'Night is easier on a TV in a dark room.', select('theme', [['paper', 'Paper'], ['night', 'Night']])),
    row('Reduce motion', 'Freezes the fire and cuts animations.', toggle('reducedMotion', (v) => {
      document.documentElement.toggleAttribute('data-reduce-motion', v);
      window.dispatchEvent(new CustomEvent('micdrop:motion', { detail: v }));
    })),

    el('div', { class: 'btnrow' },
      el('button', { class: 'btn small', onClick: async () => {
        if (await ask('Reset all settings to defaults?', { ok: 'Reset' })) { settings.reset(); render(); }
      } }, 'Reset settings')),

    el('p', { class: 'fine credits' },
      'Mic Drop · v0.3. Visualizer by ',
      el('a', { href: 'https://github.com/jberg/butterchurn', target: '_blank', rel: 'noopener' }, 'butterchurn'),
      ' (MIT), MilkDrop presets from butterchurn-presets (MIT). Beats and sounds are generated in the app.'));

  drawer.appendChild(wrap);
}
