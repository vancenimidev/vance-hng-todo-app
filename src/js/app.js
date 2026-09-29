/**
 * Entry point: wires DOM events to store actions and re-renders on state change.
 */

import * as store from './store.js';
import { generateBreakdown } from './ai/breakdown.js';
import { render, markPop } from './ui/render.js';
import { toast } from './ui/toast.js';
import { debounce, prefersReducedMotion } from './utils.js';

const els = {
  form: document.getElementById('composer'),
  input: document.getElementById('task-input'),
  composerBreakdown: document.getElementById('composer-breakdown'),
  search: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),
  list: document.getElementById('task-list'),
  filters: document.getElementById('filters'),
  clearCompleted: document.getElementById('clear-completed'),
  today: document.getElementById('today'),
};

/* ------------------------------------------------------------------ helpers */

const taskIdFrom = (el) => el.closest('[data-id]')?.dataset.id;
const subtaskIdFrom = (el) => el.closest('[data-subtask-id]')?.dataset.subtaskId;
const selectedPriority = () => new FormData(els.form).get('priority') ?? 'medium';

/** Play the exit animation, then run `done` (falls back if animations are off). */
function animateOut(el, done) {
  if (!el || prefersReducedMotion()) return done();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done();
  };
  el.style.height = `${el.offsetHeight}px`;
  el.classList.add('animate-task-out');
  el.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 450);
}

function offerUndo(message, removed) {
  if (!removed.length) return;
  toast(message, { actionLabel: 'Undo', onAction: () => store.restoreTasks(removed) });
}

async function breakdownTask(id) {
  const task = store.findTask(id);
  if (!task || store.getState().pending.has(id)) return;
  store.setPending(id, true);
  try {
    const steps = await generateBreakdown(task.title);
    if (store.findTask(id)) store.setSubtasks(id, steps);
  } catch (error) {
    console.error('[focus-flow] Breakdown failed:', error);
    toast('Could not break that task down. Please try again.', { tone: 'error' });
  } finally {
    store.setPending(id, false);
  }
}

function commitEdit(input) {
  const id = taskIdFrom(input);
  if (!id || store.getState().editingId !== id) return;
  if (!input.value.trim()) {
    toast('A task needs a title — edit cancelled.');
    store.stopEditing();
    return;
  }
  store.renameTask(id, input.value);
}

/* ----------------------------------------------------------------- composer */

function addFromComposer({ withBreakdown = false } = {}) {
  const title = els.input.value.trim();
  if (!title) {
    els.input.focus();
    els.form.classList.remove('animate-shake');
    void els.form.offsetWidth; // restart animation
    els.form.classList.add('animate-shake');
    return;
  }

  // Make sure a new task is visible even if a filter/search would hide it.
  if (store.getState().filter === 'completed') store.setFilter('all');
  if (store.getState().query) {
    els.search.value = '';
    store.setQuery('');
  }

  const task = store.addTask({ title, priority: selectedPriority() });
  els.input.value = '';
  els.input.focus();
  if (task && withBreakdown) breakdownTask(task.id);
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  addFromComposer();
});

els.composerBreakdown.addEventListener('click', () => addFromComposer({ withBreakdown: true }));

els.input.addEventListener('keydown', (event) => {
  // Cmd/Ctrl + Enter: add and break down in one go.
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    addFromComposer({ withBreakdown: true });
  }
});

/* ------------------------------------------------------------ search/filter */

const applySearch = debounce((value) => store.setQuery(value), 120);

els.search.addEventListener('input', () => {
  els.clearSearch.hidden = !els.search.value;
  applySearch(els.search.value);
});

els.search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    els.search.value = '';
    els.clearSearch.hidden = true;
    store.setQuery('');
    els.search.blur();
  }
});

els.clearSearch.addEventListener('click', () => {
  els.search.value = '';
  els.clearSearch.hidden = true;
  store.setQuery('');
  els.search.focus();
});

els.filters.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-filter]');
  if (btn) store.setFilter(btn.dataset.filter);
});

// Arrow-key navigation between filter tabs (WAI-ARIA tabs pattern).
els.filters.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const tabs = [...els.filters.querySelectorAll('[data-filter]')];
  const current = tabs.indexOf(document.activeElement);
  if (current === -1) return;
  const next = tabs[(current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  store.setFilter(next.dataset.filter);
  next.focus();
});

els.clearCompleted.addEventListener('click', () => {
  const removed = store.clearCompleted();
  offerUndo(`Cleared ${removed.length} completed ${removed.length === 1 ? 'task' : 'tasks'}.`, removed);
});

/* ---------------------------------------------------------------- task list */

const LIST_ACTIONS = {
  toggle: (id) => {
    markPop(id);
    store.toggleTask(id);
  },
  'cycle-priority': (id) => store.cyclePriority(id),
  breakdown: (id) => breakdownTask(id),
  collapse: (id) => store.toggleCollapsed(id),
  edit: (id) => store.startEditing(id),
  'clear-subs': (id) => store.clearSubtasks(id),
  delete: (id, target) => {
    const title = store.findTask(id)?.title ?? 'Task';
    animateOut(target.closest('[data-id]'), () => {
      const removed = store.removeTask(id);
      offerUndo(`Deleted “${title.length > 32 ? `${title.slice(0, 32)}…` : title}”.`, removed);
    });
  },
  'toggle-sub': (id, target) => {
    const subId = subtaskIdFrom(target);
    markPop(subId);
    store.toggleSubtask(id, subId);
  },
  'delete-sub': (id, target) => store.removeSubtask(id, subtaskIdFrom(target)),
};

els.list.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  const id = target && taskIdFrom(target);
  if (!id) return;
  LIST_ACTIONS[target.dataset.action]?.(id, target);
});

els.list.addEventListener('dblclick', (event) => {
  const title = event.target.closest('[data-action="start-edit"]');
  if (title) store.startEditing(taskIdFrom(title));
});

els.list.addEventListener('keydown', (event) => {
  const input = event.target.closest('[data-edit-input]');
  if (!input) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    commitEdit(input);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    store.stopEditing();
  }
});

els.list.addEventListener('focusout', (event) => {
  const input = event.target.closest?.('[data-edit-input]');
  if (input) commitEdit(input);
});

/* --------------------------------------------------------- global shortcuts */

document.addEventListener('keydown', (event) => {
  const typing = event.target.closest('input, textarea, [contenteditable="true"]');
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === '/') {
    event.preventDefault();
    els.search.focus();
  } else if (event.key === 'n') {
    event.preventDefault();
    els.input.focus();
  }
});

/* --------------------------------------------------------------------- boot */

let warnedAboutStorage = false;
store.onPersistFailure(() => {
  if (warnedAboutStorage) return;
  warnedAboutStorage = true;
  toast('Storage is full or unavailable — changes may not be saved.', { tone: 'error' });
});

store.subscribe((state) => render(state, store.getVisibleTasks(), store.getCounts()));

els.today.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

store.init();

// Keep relative timestamps ("5 minutes ago") fresh without user interaction.
setInterval(() => {
  if (!store.getState().editingId) render(store.getState(), store.getVisibleTasks(), store.getCounts());
}, 60_000);
