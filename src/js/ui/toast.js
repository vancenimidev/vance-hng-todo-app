/** Lightweight toast notifications with an optional action (e.g. "Undo"). */

import { escapeHtml } from '../utils.js';
import { icon } from './icons.js';

const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 3;

let region;

function getRegion() {
  region ??= document.getElementById('toast-region');
  return region;
}

function dismiss(el) {
  if (!el.isConnected || el.dataset.leaving) return;
  el.dataset.leaving = 'true';
  el.classList.add('animate-toast-out');
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 400); // fallback if animations are disabled
}

/**
 * @param {string} message
 * @param {{ actionLabel?: string, onAction?: () => void, duration?: number, tone?: 'default'|'error' }} [options]
 */
export function toast(message, { actionLabel, onAction, duration = DEFAULT_DURATION, tone = 'default' } = {}) {
  const host = getRegion();
  if (!host) return;

  const el = document.createElement('div');
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  el.className =
    'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl shadow-black/40 backdrop-blur-xl animate-toast-in ' +
    (tone === 'error' ? 'border-rose-500/30 bg-rose-950/80 text-rose-100' : 'border-white/10 bg-zinc-900/90 text-zinc-100');

  el.innerHTML = `
    <span class="flex-1">${escapeHtml(message)}</span>
    ${actionLabel ? `<button type="button" data-toast-action class="rounded-lg px-2.5 py-1 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/15 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">${escapeHtml(actionLabel)}</button>` : ''}
    <button type="button" data-toast-close aria-label="Dismiss notification" class="rounded-md p-1 text-zinc-500 transition hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">${icon('x', 'h-3.5 w-3.5')}</button>
  `;

  el.querySelector('[data-toast-action]')?.addEventListener('click', () => {
    onAction?.();
    dismiss(el);
  });
  el.querySelector('[data-toast-close]').addEventListener('click', () => dismiss(el));

  host.appendChild(el);
  while (host.children.length > MAX_VISIBLE) host.firstElementChild.remove();

  let timer = setTimeout(() => dismiss(el), duration);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => {
    timer = setTimeout(() => dismiss(el), duration / 2);
  });
}
