// "Install app" button. Chrome/Edge/Android hand us an install prompt; iPhone
// Safari doesn't, so there we explain Share > Add to Home Screen instead.

import { ask, toast } from './ui.js';

let deferred = null;

const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function refreshInstall() {
  document.querySelectorAll('[data-action="install"]').forEach((b) => { b.hidden = installed(); });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  refreshInstall();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  refreshInstall();
  toast('Installed. Mic Drop is on your home screen and works offline.');
});

export async function install() {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    refreshInstall();
  } else if (isIOS()) {
    await ask('On iPhone: tap the Share button at the bottom of Safari, then “Add to Home Screen”.', { ok: 'Got it', cancel: 'Close' });
  } else {
    await ask('Open your browser menu (⋮) and pick “Install app” or “Add to Home screen”.', { ok: 'Got it', cancel: 'Close' });
  }
}
