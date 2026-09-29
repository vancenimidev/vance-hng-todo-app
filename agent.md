# agent.md — Focus & Flow

> Context file for AI agents and humans working on this repo. Read this before
> making changes so new work stays consistent with the existing architecture.

## 1. Product summary

**Focus & Flow** is a single-page to-do app with a sleek dark UI:

- **Tasks** — add, edit (double-click / pencil), delete (with Undo), toggle completion.
- **Priorities** — Low / Medium / High badges, color-coded (emerald / amber / rose); click a badge to cycle.
- **Filtering & search** — All / Active / Done tabs plus live keyword search (matches task *and* step titles, with highlighting).
- **✨ AI Micro-Task Breakdown** — turns a task into exactly **3 actionable sub-steps** rendered indented beneath it. Available on each task and in the composer (add + breakdown in one go, also `Ctrl/⌘ + Enter`).
- **Persistence** — `localStorage`, versioned schema, validated on load.

## 2. Tech stack

| Concern      | Choice                                                    | Notes |
|--------------|-----------------------------------------------------------|-------|
| Markup       | Semantic HTML5 (`index.html`)                             | ARIA tabs, checkboxes, live regions |
| Styling      | Tailwind CSS **v3.4.17 Play CDN** + `src/css/styles.css`  | Tailwind for utilities; custom CSS only for keyframes, backdrop, gradient borders |
| Logic        | Vanilla JavaScript, **native ES modules**                 | No framework, no bundler, no dependencies |
| Fonts        | Inter (UI) + Space Grotesk (display) via Google Fonts     | |
| Icons        | Inline Lucide SVG paths (`src/js/ui/icons.js`)            | |
| Hosting      | Static — Vercel (`vercel.json`) or Netlify (`netlify.toml`) | No build step |

Because ES modules are used, the app must be served over HTTP (`npm run dev`), not opened via `file://`.

## 3. Architecture

```
index.html                 App shell: static layout, composer, toolbar, list containers
favicon.svg
src/
  css/styles.css           Animations, ambient background, reduced-motion handling
  js/
    tailwind.config.js     Runtime config for the Tailwind Play CDN
    app.js                 Entry: DOM event wiring -> store actions; boot
    store.js               State, actions, selectors, pub/sub (single source of truth)
    storage.js             localStorage adapter (load/save, schema version, validation)
    utils.js               uid, escapeHtml, debounce, timeAgo, …
    ai/breakdown.js        AI Micro-Task Breakdown engine (simulated)
    ui/render.js           State -> DOM templates (list, stats, filters, empty states)
    ui/toast.js            Toasts with optional action (Undo)
    ui/icons.js            SVG icon strings
```

### Data flow (unidirectional)

```
user event ──> app.js handler ──> store action ──> mutate + saveTasks() ──> emit()
                                                                              │
                   DOM <── ui/render.js render(state, visibleTasks, counts) <─┘
```

- **Only `store.js` mutates state.** UI code calls exported actions (`addTask`, `toggleTask`, `setSubtasks`, …).
- **Only `storage.js` touches `localStorage`.**
- **Only `ai/breakdown.js` knows how steps are generated.**
- `render.js` re-renders the list from templates on every change. It tracks already-rendered ids so enter animations only play for new items. Event handling uses **delegation** on `#task-list` via `data-action` attributes.

### Data model (persisted under `focus-flow:tasks`, `version: 1`)

```ts
type Priority = 'low' | 'medium' | 'high';

interface Subtask { id: string; title: string; completed: boolean }

interface Task {
  id: string;
  title: string;          // trimmed, whitespace-collapsed, max 200 chars
  priority: Priority;
  completed: boolean;
  collapsed: boolean;     // steps hidden in the UI
  createdAt: number;      // epoch ms
  updatedAt: number;
  subtasks: Subtask[];
}
```

Business rules:
- Completing a task completes all its steps; completing every step completes the task; re-opening a step re-opens the task.
- A fresh breakdown replaces existing steps and re-opens the task.
- First visit (no saved key) seeds 4 demo tasks; an empty saved list is respected.

UI-only state (`filter`, `query`, `editingId`, `pending` breakdowns) is never persisted.

### AI breakdown contract

```js
generateBreakdown(title: string): Promise<string[]>  // always exactly 3 steps
```

Current implementation: an ordered list of intent rules (bug fix, writing, engineering, meeting, learning, communication, travel, finance, shopping, fitness, cooking, cleaning, design, planning) matched by keyword regex, with a generic fallback. `extractSubject()` strips the leading verb and adds a determiner so steps read naturally ("Outline the key points for **the blog post about remote work**"). A ~650 ms simulated latency drives the "thinking" shimmer UI. `buildSteps()` is the pure synchronous core.

## 4. Conventions

- **Security:** every piece of user text interpolated into HTML goes through `escapeHtml()` (search highlighting escapes each fragment). Never use `innerHTML` with raw user input.
- **Styling:** prefer Tailwind utilities in templates; add to `styles.css` only for keyframes or things utilities can't express. Palette: zinc surfaces, violet→cyan brand gradient, emerald/amber/rose priorities. Keep class strings literal (no string-concatenated class fragments) so a future Tailwind compile step can detect them.
- **Accessibility:** interactive elements are `<button>`s with labels; custom checkboxes use `role="checkbox"` + `aria-checked`; filters follow the ARIA tabs pattern; all motion respects `prefers-reduced-motion`.
- **New actions:** add a function to `store.js`, a `data-action` button in `render.js`, and a handler in `LIST_ACTIONS` in `app.js`.
- **Schema changes:** bump `SCHEMA_VERSION` in `storage.js` and add a migration rather than dropping data.
- Keyboard shortcuts: `N` focus composer, `/` focus search, `Esc` clear search / cancel edit, `Enter` save, `Ctrl/⌘+Enter` add + breakdown.

## 5. Running & deploying

```bash
npm run dev          # serves the repo root at http://localhost:5173 (any static server works)
```

- **Vercel:** import the repo, framework preset "Other", no build command, output directory `.`.
- **Netlify:** import the repo; `netlify.toml` publishes the root with security headers.

## 6. Future scalability notes

1. **Compile Tailwind for production.** The Play CDN compiles in the browser (and logs a console warning). Move to the Tailwind CLI / PostCSS (`content: ['index.html', 'src/**/*.js']`) and ship a minified CSS file; this also enables a strict Content-Security-Policy (`script-src 'self'`), which is intentionally not set yet because the CDN runtime's CSP needs haven't been verified.
2. **Real LLM breakdowns.** Add a serverless function (`/api/breakdown` on Vercel or `netlify/functions/breakdown.js`) that calls an LLM with a prompt requiring a JSON array of exactly three short, imperative steps. Keep the API key server-side. Replace the body of `generateBreakdown()` with a `fetch` to that endpoint, validate the response, and fall back to `buildSteps()` on error or timeout.
3. **Sync / multi-device.** Implement a new adapter with the same `loadTasks`/`saveTasks` surface (e.g. Supabase or Firebase) — make it async and add optimistic updates in the store. `updatedAt` already exists for last-write-wins conflict resolution.
4. **Scale of the list.** Full re-render is fine for hundreds of tasks. Beyond that, switch `render.js` to keyed DOM diffing (or adopt a small view library such as Lit/Preact) without changing the store API.
5. **Features that fit the model:** due dates & reminders, tags/projects, drag-and-drop ordering (add an `order` field), manual step editing, light theme (tokens already centralized in class strings + `styles.css`), PWA/offline via a service worker + manifest.
6. **Testing.** `buildSteps`, `extractSubject`, store actions and selectors are pure/isolated and can be unit-tested with Vitest; UI flows can be covered with Playwright.
