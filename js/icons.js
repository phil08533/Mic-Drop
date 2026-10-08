// Inline SVG icons, drawn on a 24px grid. Stroke follows currentColor.

const PATHS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z" fill="currentColor" stroke="none"/>',
  stop: '<path d="M6 6h12v12H6z" fill="currentColor" stroke="none"/>',
  next: '<path d="M5 5.5l9 6.5-9 6.5z" fill="currentColor" stroke="none"/><path d="M17.5 5.5v13"/>',
  shuffle: '<path d="M3 7h3.5c4.5 0 6.5 10 11 10H21M3 17h3.5c1.6 0 2.8-1.2 3.8-2.8M13.7 9.8C14.7 8.2 15.9 7 17.5 7H21M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  back: '<path d="M15 4.5L7.5 12l7.5 7.5"/>',
  close: '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10.5H4.8z" fill="currentColor"/>',
  mic: '<rect x="8.8" y="2.5" width="6.4" height="11" rx="3.2"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7"/>',
  flame: '<path d="M12 21.5c-3.9 0-6.6-2.7-6.6-6.3 0-3.6 2.6-5.3 3.4-8.6 1 1.8 1.8 2.7 2.8 3.2.3-2.7 1.3-5 3.1-6.8.3 3.4 4 5.9 4 10.3 0 4.4-2.9 8.2-6.7 8.2z"/>',
  horn: '<path d="M3.5 10v4h3l9 5V5l-9 5z"/><path d="M18.5 9a4.2 4.2 0 010 6M20.5 6.5a7.6 7.6 0 010 11"/>',
  rewind: '<path d="M11.5 6v12L3 12zM21 6v12l-8.5-6z" fill="currentColor" stroke="none"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>',
  clap: '<path d="M8 13l-2.5-6M11 11.5L8.8 4.6M14.2 11L13 4.2M16 13.5l1.5-5.5"/><path d="M5 13.5c0 4 2.8 7 7 7s7-3 7-7"/>',
  wave: '<path d="M2.5 12h3l2-6 3.5 13 3.5-11 2.2 6.5 1.3-2.5h3.5"/>',
  grid: '<path d="M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM16 10h4v4h-4zM10 16h4v4h-4z" fill="currentColor" stroke="none"/><path d="M10 10h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>',
  link: '<path d="M10 14a4.2 4.2 0 006 0l3-3a4.2 4.2 0 00-6-6l-1 1M14 10a4.2 4.2 0 00-6 0l-3 3a4.2 4.2 0 006 6l1-1"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  arrowL: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  arrowR: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  help: '<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 015.4 1c0 1.9-2.7 2.4-2.7 4.1"/><circle cx="12" cy="17.6" r="1.1" fill="currentColor" stroke="none"/>',
  cards: '<rect x="4" y="5" width="10" height="15" rx="1.5"/><path d="M14 7.5l5.2 1.3-3.3 13.2-6.4-1.6"/>',
  save: '<path d="M5 4h11.5L20 7.5V20H4V4z"/><path d="M8 4v5h7V4M7.5 20v-6.5h9V20"/>',
};

export function icon(name, size = 20) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return span;
}
