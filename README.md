# Focus & Flow

A calm, dark-mode to-do app with AI-style micro-task breakdowns. Built with HTML, Tailwind CSS (CDN) and vanilla JavaScript: no framework and no build step.

## Features

- **Tasks:** add, edit (double-click or pencil), delete with undo, and mark complete. Everything is saved to `localStorage`.
- **Priorities:** Low, Medium and High badges in different colors. Click a badge to change it.
- **Filter and search:** All, Active and Done tabs, plus live keyword search with highlighted matches.
- **✨ Breakdown:** splits any task into 3 actionable steps, shown indented underneath it. You can check off or delete each step, or collapse them.
- Smooth animations, a live progress ring, keyboard shortcuts, responsive layout, and support for accessibility settings like reduced motion.

## Run locally

ES modules need an HTTP server, so opening `index.html` directly from disk (`file://`) won't work.

```bash
npm run dev       # http://localhost:5173
# or: python3 -m http.server 5173
```

## Deploy

- **Vercel:** import the repo, choose the "Other" preset, and leave the build command empty. `vercel.json` adds security headers.
- **Netlify:** import the repo. `netlify.toml` publishes the root folder.

## Keyboard shortcuts

| Key            | Action                  |
|----------------|-------------------------|
| `N`            | Focus the new-task input |
| `/`            | Focus search            |
| `Enter`        | Add task / save edit    |
| `Ctrl/⌘ + Enter` | Add task and break it down |
| `Esc`          | Cancel edit / clear search |

## Project structure

See [`agent.md`](./agent.md) for the architecture, data model, conventions and roadmap.
