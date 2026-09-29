/**
 * View layer: pure state -> DOM. The task list is re-rendered from templates on
 * every change (cheap at to-do scale); enter animations only play for ids that
 * have not been rendered before, so re-renders never flicker.
 */

import { escapeHtml, escapeRegExp, timeAgo } from '../utils.js';
import { icon } from './icons.js';

export const PRIORITY_META = {
  high: {
    label: 'High',
    badge: 'bg-rose-500/10 text-rose-300 ring-rose-500/25 hover:bg-rose-500/20',
    accent: 'bg-gradient-to-b from-rose-400 to-pink-600',
  },
  medium: {
    label: 'Medium',
    badge: 'bg-amber-500/10 text-amber-300 ring-amber-500/25 hover:bg-amber-500/20',
    accent: 'bg-gradient-to-b from-amber-300 to-orange-500',
  },
  low: {
    label: 'Low',
    badge: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25 hover:bg-emerald-500/20',
    accent: 'bg-gradient-to-b from-emerald-300 to-teal-500',
  },
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 26;

const seenTasks = new Set();
const seenSubtasks = new Set();
const popIds = new Set();
let hasRendered = false;

/** Ask the next render to play the "pop" animation on a checkbox. */
export function markPop(id) {
  popIds.add(id);
}

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ templates */

function highlight(text, query) {
  const q = query.trim();
  if (!q) return escapeHtml(text);
  return text
    .split(new RegExp(`(${escapeRegExp(q)})`, 'ig'))
    .map((part, i) =>
      i % 2 === 1 ? `<mark class="rounded bg-violet-500/30 px-0.5 text-violet-100">${escapeHtml(part)}</mark>` : escapeHtml(part),
    )
    .join('');
}

function checkbox({ checked, action, label, id, size = 'h-5 w-5' }) {
  const pop = popIds.has(id) ? ' animate-pop' : '';
  return `
    <button type="button" role="checkbox" aria-checked="${checked}" aria-label="${escapeHtml(label)}" data-action="${action}"
      class="check group/check relative mt-0.5 grid ${size} shrink-0 place-items-center rounded-full border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950${pop} ${
        checked
          ? 'border-transparent bg-gradient-to-br from-violet-500 to-cyan-400 shadow-[0_0_14px_-2px] shadow-violet-500/70'
          : 'border-zinc-600 hover:border-violet-400 hover:bg-violet-500/10'
      }">
      <span class="${checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0 group-hover/check:scale-75 group-hover/check:opacity-40'} text-white transition-all duration-200">${icon('check', 'h-3 w-3 stroke-[3]')}</span>
    </button>`;
}

function subtaskTemplate(task, sub, index, query) {
  const animate = hasRendered && !seenSubtasks.has(sub.id);
  return `
    <li data-subtask-id="${sub.id}" class="group/sub flex items-start gap-3 rounded-lg py-1.5 pl-2 pr-1 transition-colors hover:bg-white/[0.03]${animate ? ' animate-step-in' : ''}"${animate ? ` style="animation-delay:${index * 110}ms"` : ''}>
      ${checkbox({ checked: sub.completed, action: 'toggle-sub', label: `Mark step "${sub.title}" as ${sub.completed ? 'not done' : 'done'}`, id: sub.id, size: 'h-4 w-4' })}
      <span class="min-w-0 flex-1 break-words text-[13px] leading-5 transition-colors ${sub.completed ? 'text-zinc-500 line-through decoration-zinc-600' : 'text-zinc-300'}">${highlight(sub.title, query)}</span>
      <button type="button" data-action="delete-sub" aria-label="Delete step" class="rounded-md p-1 text-zinc-600 opacity-100 transition hover:bg-rose-500/10 hover:text-rose-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:opacity-0 sm:group-hover/sub:opacity-100">
        ${icon('x', 'h-3.5 w-3.5')}
      </button>
    </li>`;
}

function skeletonSteps() {
  return `
    <div class="ml-8 mt-1 space-y-2 border-l border-violet-500/30 py-2 pl-5 sm:ml-12" aria-live="polite">
      <p class="flex items-center gap-2 text-xs font-medium text-violet-300">${icon('sparkles', 'h-3.5 w-3.5 animate-pulse')} Thinking through the smallest next steps…</p>
      ${[88, 72, 80].map((w) => `<div class="shimmer h-3 rounded-full" style="width:${w}%"></div>`).join('')}
    </div>`;
}

function subtasksBlock(task, state) {
  if (state.pending.has(task.id)) return skeletonSteps();
  if (!task.subtasks.length || task.collapsed) return '';
  return `
    <div class="ml-8 border-l border-white/10 pb-3 pl-3 pr-2 sm:ml-12">
      <ul class="space-y-0.5" aria-label="Steps for ${escapeHtml(task.title)}">
        ${task.subtasks.map((sub, i) => subtaskTemplate(task, sub, i, state.query)).join('')}
      </ul>
      <button type="button" data-action="clear-subs" class="ml-2 mt-1 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-300 focus-visible:outline-none focus-visible:underline">Clear steps</button>
    </div>`;
}

function actionButton(action, label, iconName, extra = '') {
  return `<button type="button" data-action="${action}" aria-label="${label}" title="${label}"
    class="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${extra}">${icon(iconName)}</button>`;
}

function taskTemplate(task, state, index) {
  const meta = PRIORITY_META[task.priority];
  const editing = state.editingId === task.id;
  const pending = state.pending.has(task.id);
  const doneSteps = task.subtasks.filter((s) => s.completed).length;
  const isNew = !seenTasks.has(task.id);
  const enterClass = isNew ? ' animate-task-in' : '';
  const enterStyle = isNew && !hasRendered ? ` style="animation-delay:${Math.min(index, 8) * 60}ms"` : '';

  const title = editing
    ? `<input data-edit-input type="text" maxlength="200" value="${escapeHtml(task.title)}" aria-label="Edit task title"
        class="w-full rounded-lg border border-violet-500/50 bg-zinc-950/60 px-2.5 py-1 text-[15px] text-zinc-50 outline-none ring-4 ring-violet-500/15 placeholder:text-zinc-500" />`
    : `<p data-action="start-edit" class="cursor-text break-words text-[15px] leading-6 transition-colors ${task.completed ? 'text-zinc-500 line-through decoration-zinc-600' : 'text-zinc-100'}" title="Double-click to edit">${highlight(task.title, state.query)}</p>`;

  const breakdownBtn = task.subtasks.length
    ? `<button type="button" data-action="collapse" aria-expanded="${!task.collapsed}" aria-label="${task.collapsed ? 'Show' : 'Hide'} steps"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-inset ring-white/10 transition hover:bg-white/5 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        ${doneSteps}/${task.subtasks.length} steps
        <span class="transition-transform duration-300 ${task.collapsed ? '-rotate-90' : ''}">${icon('chevron', 'h-3 w-3')}</span>
      </button>`
    : `<button type="button" data-action="breakdown" ${pending ? 'disabled aria-busy="true"' : ''}
        class="breakdown-btn inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-semibold text-violet-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-wait disabled:opacity-70">
        ${pending ? icon('loader', 'h-3 w-3 animate-spin') : '<span aria-hidden="true">✨</span>'} ${pending ? 'Breaking down…' : 'Breakdown'}
      </button>`;

  return `
    <li data-id="${task.id}" class="task group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] transition-colors duration-300 hover:border-white/10 hover:bg-white/[0.04] ${task.completed ? 'is-done' : ''}${enterClass}"${enterStyle}>
      <span class="absolute inset-y-3 left-0 w-[3px] rounded-r-full ${meta.accent} ${task.completed ? 'opacity-30' : 'opacity-90'} transition-opacity" aria-hidden="true"></span>
      <div class="flex items-start gap-3 py-3.5 pl-4 pr-2 sm:gap-4 sm:pl-5">
        ${checkbox({ checked: task.completed, action: 'toggle', label: `Mark "${task.title}" as ${task.completed ? 'active' : 'completed'}`, id: task.id })}
        <div class="min-w-0 flex-1">
          ${title}
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <button type="button" data-action="cycle-priority" title="Change priority" aria-label="Priority: ${meta.label}. Click to change."
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${meta.badge}">
              ${icon('flag', 'h-3 w-3')} ${meta.label}
            </button>
            ${breakdownBtn}
            <span class="inline-flex items-center gap-1 text-[11px] text-zinc-500">${icon('clock', 'h-3 w-3')}${timeAgo(task.createdAt)}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          ${actionButton('edit', 'Edit task', 'pencil')}
          ${actionButton('delete', 'Delete task', 'trash', 'hover:!bg-rose-500/10 hover:!text-rose-300')}
        </div>
      </div>
      ${subtasksBlock(task, state)}
    </li>`;
}

function emptyTemplate(state, counts) {
  let iconName = 'inbox';
  let title = 'Your mind is clear';
  let body = 'Add your first task above — then let ✨ Breakdown turn it into bite-sized steps.';

  if (state.query.trim()) {
    iconName = 'searchX';
    title = 'No matches';
    body = `Nothing matches “${escapeHtml(state.query.trim())}”. Try a different keyword.`;
  } else if (state.filter === 'active' && counts.total) {
    iconName = 'party';
    title = 'All done. Enjoy the flow.';
    body = 'Every task is complete. Take a breath — you earned it.';
  } else if (state.filter === 'completed' && counts.total) {
    iconName = 'check';
    title = 'Nothing completed yet';
    body = 'Finish a task and it will show up here.';
  }

  return `
    <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-400/10 text-violet-300 ring-1 ring-inset ring-white/10">${icon(iconName, 'h-6 w-6')}</div>
    <h3 class="mt-4 text-base font-semibold text-zinc-100">${title}</h3>
    <p class="mx-auto mt-1 max-w-xs text-sm text-zinc-400">${body}</p>`;
}

/* --------------------------------------------------------------- render roots */

function renderStats(counts) {
  const percent = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  $('progress-ring').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - percent / 100));
  $('progress-percent').textContent = `${percent}%`;
  $('stat-active').textContent = counts.active;
  $('stat-completed').textContent = counts.completed;
  $('progress-caption').textContent = !counts.total
    ? 'No tasks yet'
    : counts.active === 0
      ? 'Everything done — beautiful.'
      : `${counts.active} to go — keep the flow.`;
}

function renderFilters(state, counts) {
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    const active = btn.dataset.filter === state.filter;
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
    const count = btn.querySelector('[data-count]');
    if (count) count.textContent = counts[btn.dataset.filter];
  });
}

function renderFooter(counts) {
  $('items-left').textContent = `${counts.active} ${counts.active === 1 ? 'task' : 'tasks'} left`;
  $('clear-completed').disabled = counts.completed === 0;
}

export function render(state, visibleTasks, counts) {
  const list = $('task-list');
  const empty = $('empty-state');

  list.innerHTML = visibleTasks.map((task, i) => taskTemplate(task, state, i)).join('');
  empty.hidden = visibleTasks.length > 0;
  if (!visibleTasks.length) empty.innerHTML = emptyTemplate(state, counts);

  renderStats(counts);
  renderFilters(state, counts);
  renderFooter(counts);

  visibleTasks.forEach((task) => {
    seenTasks.add(task.id);
    task.subtasks.forEach((sub) => seenSubtasks.add(sub.id));
  });
  popIds.clear();
  hasRendered = true;

  if (state.editingId) {
    const input = list.querySelector('[data-edit-input]');
    if (input && document.activeElement !== input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}
