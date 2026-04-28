// Settings drawer.

import { $, el, clear } from './ui.js';
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
  if (musicDrawer.getAttribute('aria-hidden') !== 'false') {
    scrim.hidden = true;
  }
}

function row(label, desc, control) {
  return el('div', { class: 'row' },
    el('div', {},
      el('div', { class: 'label' }, label),
      el('div', { class: 'desc' }, desc),
    ),
    control,
  );
}

function toggle(id, value, onchange) {
  const wrap = el('label', { class: 'toggle', for: id });
  const input = el('input', { type: 'checkbox', id });
  input.checked = !!value;
  input.addEventListener('change', () => onchange(input.checked));
  const track = el('span', { class: 'track' });
  wrap.append(input, track);
  return wrap;
}

function slider(value, onchange, { min = 0, max = 100, step = 1 } = {}) {
  const wrap = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } });
  const range = el('input', { type: 'range', min, max, step, value });
  const label = el('span', { class: 'note', style: { minWidth: '36px', textAlign: 'right' } }, String(value) + '%');
  range.addEventListener('input', () => {
    label.textContent = range.value + '%';
    onchange(+range.value);
  });
  wrap.append(range, label);
  return wrap;
}

function render() {
  if (drawer.getAttribute('aria-hidden') !== 'false') return;
  clear(drawer);
  drawer.appendChild(el('button', { class: 'closebtn', onClick: closeSettings, 'aria-label': 'Close settings' }, 'CLOSE'));
  drawer.appendChild(el('h2', {}, 'Settings'));

  const wrap = el('div', { class: 'settings' });

  // Music volume
  wrap.appendChild(row('Music volume', 'Background beats for the booth.',
    slider(Math.round(settings.get('musicVolume') * 100), (v) => {
      settings.set('musicVolume', v / 100);
      applyMusicVolume(v / 100);
    })));

  // SFX volume + on/off
  wrap.appendChild(row('Sound effects', 'Card flips, round transitions, win horn.',
    toggle('sfx-on', settings.get('sfxOn'), (v) => settings.set('sfxOn', v))));

  wrap.appendChild(row('SFX volume', 'How loud the in-app sounds are.',
    slider(Math.round(settings.get('sfxVolume') * 100), (v) => settings.set('sfxVolume', v / 100))));

  // Round timer length
  const select = el('select', { class: 'select' });
  for (const s of [30, 45, 60, 90, 120]) {
    const opt = el('option', { value: s }, `${s}s`);
    if (s === settings.get('roundSeconds')) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => settings.set('roundSeconds', +select.value));
  wrap.appendChild(row('Round timer', 'Length of one bar trade.', select));

  // Show rhyme hint
  wrap.appendChild(row('Rhyme hints', 'Show extra rhyming words on each Rhyme card.',
    toggle('rhyme-hint', settings.get('showRhymeHint'), (v) => settings.set('showRhymeHint', v))));

  // Reduced motion
  wrap.appendChild(row('Reduce motion', 'Cuts animations for sensitive viewers.',
    toggle('reduce-motion', settings.get('reducedMotion'), (v) => {
      settings.set('reducedMotion', v);
      document.documentElement.style.setProperty('--motion', v ? 'none' : '');
    })));

  // Theme
  const themeSel = el('select', { class: 'select' },
    el('option', { value: 'dark' }, 'Dark'),
    el('option', { value: 'light' }, 'Light'),
  );
  themeSel.value = settings.get('theme');
  themeSel.addEventListener('change', () => settings.set('theme', themeSel.value));
  wrap.appendChild(row('Theme', 'Light works for outdoor / projector play.', themeSel));

  // Reset
  const resetBtn = el('button', { class: 'ghostbtn', onClick: () => {
    if (confirm('Reset all settings to defaults?')) { settings.reset(); render(); }
  } }, 'Reset to defaults');
  wrap.appendChild(resetBtn);

  // App info
  wrap.appendChild(el('div', { class: 'note', style: { marginTop: '14px' } },
    'Mic Drop · v0.1 · ',
    el('a', { href: 'https://itch.io', target: '_blank', rel: 'noopener', style: { color: 'var(--hot)' } }, 'itch.io'),
  ));

  drawer.appendChild(wrap);
}
