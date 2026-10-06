// Tiny DOM helpers. No dependencies.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class')      node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html')  node.innerHTML = v;
    else if (k === 'text')  node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'data' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else {
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function tpl(id) {
  const t = document.getElementById(id);
  if (!t) throw new Error(`Missing template #${id}`);
  return t.content.cloneNode(true);
}

export function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// In-page yes/no dialog. Resolves true/false.
export function ask(message, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const okBtn = el('button', { class: 'btn ' + (danger ? 'red' : 'ink'), onClick: () => done(true) }, ok);
    const wrap = el('div', { class: 'dialog-wrap', onClick: (e) => { if (e.target === wrap) done(false); } },
      el('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
        el('p', {}, message),
        el('div', { class: 'btnrow end' },
          el('button', { class: 'btn', onClick: () => done(false) }, cancel),
          okBtn)));
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey);
    okBtn.focus();
  });
}

// Small note that slides up from the bottom and goes away.
export function toast(message, ms = 2600) {
  const t = el('div', { class: 'toast', role: 'status' }, message);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

// Rubber stamp slammed across the screen ("TIME!", "MIC DROP!").
export function stamp(text, tone = 'red', ms = 1300) {
  const s = el('div', { class: `stamp ${tone}`, 'aria-hidden': 'true' }, el('span', {}, text));
  s.style.setProperty('--hold', `${Math.max(300, ms - 300)}ms`);
  document.body.appendChild(s);
  setTimeout(() => s.remove(), ms);
}
