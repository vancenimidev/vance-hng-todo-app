/**
 * Persistence adapter. The rest of the app only talks to `loadTasks` / `saveTasks`,
 * so swapping localStorage for IndexedDB or a remote API only touches this file.
 */

const STORAGE_KEY = 'focus-flow:tasks';
const SCHEMA_VERSION = 1;
const PRIORITIES = new Set(['low', 'medium', 'high']);

function normalizeSubtask(raw) {
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  return { id: raw.id, title: raw.title, completed: Boolean(raw.completed) };
}

function normalizeTask(raw) {
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  const now = Date.now();
  return {
    id: raw.id,
    title: raw.title,
    priority: PRIORITIES.has(raw.priority) ? raw.priority : 'medium',
    completed: Boolean(raw.completed),
    collapsed: Boolean(raw.collapsed),
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
    subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.map(normalizeSubtask).filter(Boolean) : [],
  };
}

/**
 * @returns {Array|null} saved tasks, or `null` when nothing has ever been saved
 * (lets the store decide whether to seed demo content).
 */
export function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const data = JSON.parse(raw);
    if (data?.version !== SCHEMA_VERSION || !Array.isArray(data.tasks)) return [];
    return data.tasks.map(normalizeTask).filter(Boolean);
  } catch (error) {
    console.warn('[focus-flow] Could not read saved tasks:', error);
    return [];
  }
}

/** @returns {boolean} whether the write succeeded (quota / private mode can fail). */
export function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, tasks }));
    return true;
  } catch (error) {
    console.warn('[focus-flow] Could not save tasks:', error);
    return false;
  }
}
