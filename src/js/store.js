/**
 * Single source of truth. Components never mutate state directly: they call the
 * exported actions, which mutate, persist, and notify subscribers.
 */

import { loadTasks, saveTasks } from './storage.js';
import { buildSteps } from './ai/breakdown.js';
import { uid } from './utils.js';

export const PRIORITIES = ['low', 'medium', 'high'];
export const FILTERS = ['all', 'active', 'completed'];
export const MAX_TITLE_LENGTH = 200;

const state = {
  tasks: [],
  filter: 'all',
  query: '',
  editingId: null,
  /** Task ids with an AI breakdown in flight (UI-only, never persisted). */
  pending: new Set(),
};

const listeners = new Set();

export const getState = () => state;

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener(state));
}

let onPersistError = () => {};
export function onPersistFailure(handler) {
  onPersistError = handler;
}

function commit(mutate, { persist = true } = {}) {
  mutate(state);
  if (persist && !saveTasks(state.tasks)) onPersistError();
  emit();
}

/* ------------------------------------------------------------------ factories */

const sanitizeTitle = (title) => String(title ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH);

const makeSubtask = (title, completed = false) => ({ id: uid(), title: sanitizeTitle(title), completed });

function makeTask({ title, priority = 'medium', subtasks = [], completed = false, createdAt = Date.now() }) {
  return {
    id: uid(),
    title: sanitizeTitle(title),
    priority: PRIORITIES.includes(priority) ? priority : 'medium',
    completed,
    collapsed: false,
    createdAt,
    updatedAt: createdAt,
    subtasks: subtasks.map((s) => (typeof s === 'string' ? makeSubtask(s) : makeSubtask(s.title, s.completed))),
  };
}

function seedTasks() {
  const now = Date.now();
  const minutes = (n) => now - n * 60_000;
  const [first, ...rest] = buildSteps('Prepare quarterly product presentation');
  return [
    makeTask({
      title: 'Prepare quarterly product presentation',
      priority: 'high',
      createdAt: minutes(5),
      subtasks: [{ title: first, completed: true }, ...rest],
    }),
    makeTask({ title: 'Fix login redirect bug on mobile', priority: 'high', createdAt: minutes(42) }),
    makeTask({ title: 'Plan weekend trip to the coast', priority: 'medium', createdAt: minutes(180) }),
    makeTask({ title: 'Read 20 pages of Deep Work', priority: 'low', completed: true, createdAt: minutes(60 * 26) }),
  ];
}

export function init() {
  const saved = loadTasks();
  state.tasks = saved ?? seedTasks();
  if (saved === null) saveTasks(state.tasks);
  emit();
}

/* -------------------------------------------------------------------- helpers */

function mapTask(id, fn) {
  state.tasks = state.tasks.map((task) => (task.id === id ? { ...fn(task), updatedAt: Date.now() } : task));
}

export const findTask = (id) => state.tasks.find((task) => task.id === id);

/* -------------------------------------------------------------- task actions */

/** @returns {object|null} the created task, or null for an empty title. */
export function addTask({ title, priority, subtasks = [] }) {
  if (!sanitizeTitle(title)) return null;
  const task = makeTask({ title, priority, subtasks });
  commit((s) => {
    s.tasks = [task, ...s.tasks];
  });
  return task;
}

export function renameTask(id, title) {
  const clean = sanitizeTitle(title);
  commit((s) => {
    s.editingId = null;
    if (clean) mapTask(id, (t) => ({ ...t, title: clean }));
  });
}

export function toggleTask(id) {
  commit(() =>
    mapTask(id, (t) => {
      const completed = !t.completed;
      // Completing a parent completes its steps; re-opening leaves them untouched.
      const subtasks = completed ? t.subtasks.map((sub) => ({ ...sub, completed: true })) : t.subtasks;
      return { ...t, completed, subtasks };
    }),
  );
}

export function cyclePriority(id) {
  commit(() =>
    mapTask(id, (t) => ({ ...t, priority: PRIORITIES[(PRIORITIES.indexOf(t.priority) + 1) % PRIORITIES.length] })),
  );
}

/** @returns {Array<{task, index}>} entries that can be handed to `restoreTasks` for undo. */
export function removeTask(id) {
  const index = state.tasks.findIndex((t) => t.id === id);
  if (index === -1) return [];
  const removed = [{ task: state.tasks[index], index }];
  commit((s) => {
    s.tasks = s.tasks.filter((t) => t.id !== id);
    if (s.editingId === id) s.editingId = null;
  });
  return removed;
}

export function clearCompleted() {
  const removed = state.tasks.map((task, index) => ({ task, index })).filter(({ task }) => task.completed);
  if (!removed.length) return [];
  commit((s) => {
    s.tasks = s.tasks.filter((t) => !t.completed);
  });
  return removed;
}

export function restoreTasks(entries) {
  commit((s) => {
    const tasks = [...s.tasks];
    [...entries]
      .sort((a, b) => a.index - b.index)
      .forEach(({ task, index }) => tasks.splice(Math.min(index, tasks.length), 0, task));
    s.tasks = tasks;
  });
}

/* ----------------------------------------------------------- subtask actions */

export function setSubtasks(id, titles) {
  commit(() =>
    mapTask(id, (t) => ({ ...t, completed: false, collapsed: false, subtasks: titles.map((title) => makeSubtask(title)) })),
  );
}

export function toggleSubtask(taskId, subtaskId) {
  commit(() =>
    mapTask(taskId, (t) => {
      const subtasks = t.subtasks.map((sub) => (sub.id === subtaskId ? { ...sub, completed: !sub.completed } : sub));
      // Keep the parent in sync: all steps done => task done; any step re-opened => task re-opened.
      const completed = subtasks.length > 0 && subtasks.every((sub) => sub.completed);
      return { ...t, subtasks, completed };
    }),
  );
}

export function removeSubtask(taskId, subtaskId) {
  commit(() => mapTask(taskId, (t) => ({ ...t, subtasks: t.subtasks.filter((sub) => sub.id !== subtaskId) })));
}

export function clearSubtasks(taskId) {
  commit(() => mapTask(taskId, (t) => ({ ...t, subtasks: [] })));
}

export function toggleCollapsed(taskId) {
  commit(() => mapTask(taskId, (t) => ({ ...t, collapsed: !t.collapsed })));
}

/* ---------------------------------------------------------------- UI actions */

export function setFilter(filter) {
  if (!FILTERS.includes(filter)) return;
  commit((s) => {
    s.filter = filter;
  }, { persist: false });
}

export function setQuery(query) {
  commit((s) => {
    s.query = String(query ?? '');
  }, { persist: false });
}

export function startEditing(id) {
  commit((s) => {
    s.editingId = id;
  }, { persist: false });
}

export function stopEditing() {
  if (state.editingId === null) return;
  commit((s) => {
    s.editingId = null;
  }, { persist: false });
}

export function setPending(id, isPending) {
  commit((s) => {
    if (isPending) s.pending.add(id);
    else s.pending.delete(id);
  }, { persist: false });
}

/* ----------------------------------------------------------------- selectors */

export function getCounts() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((t) => t.completed).length;
  return { total, completed, active: total - completed };
}

export function getVisibleTasks() {
  const query = state.query.trim().toLowerCase();
  return state.tasks.filter((task) => {
    if (state.filter === 'active' && task.completed) return false;
    if (state.filter === 'completed' && !task.completed) return false;
    if (!query) return true;
    return (
      task.title.toLowerCase().includes(query) ||
      task.subtasks.some((sub) => sub.title.toLowerCase().includes(query))
    );
  });
}
