# React + Vite + TS Shared CLAUDE.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `~/.claude/react-vite-ts.md`, a reusable importable rules file for React + Vite + TypeScript projects.

**Architecture:** A single markdown file placed at `~/.claude/react-vite-ts.md` containing only fixed, project-agnostic rules (no project-specific headings). Any project's `CLAUDE.md` imports it with `@~/.claude/react-vite-ts.md` and adds project-specific sections on top. This project's `CLAUDE.md` is updated to demonstrate the pattern.

**Tech Stack:** Markdown, Claude Code `@import` syntax.

**Spec:** `docs/superpowers/specs/2026-03-21-react-vite-ts-claude-md-design.md`

---

### Task 1: Create `~/.claude/react-vite-ts.md`

**Files:**
- Create: `~/.claude/react-vite-ts.md`

- [ ] **Step 1: Write the file**

Create `~/.claude/react-vite-ts.md` with this exact content:

```markdown
# React + Vite + TypeScript — Shared Claude Rules

> The importing CLAUDE.md defines project-specific sections (Project Overview, Tech Stack,
> Architecture, Commands). Read those first. The rules below apply on top of them.

## Explore Before You Code

Before proposing any change:
1. Read existing components, hooks, and utilities related to the feature.
2. Identify patterns already in use — follow them instead of introducing new ones.
3. Check if a utility, hook, or component already does what you need.
4. Never reinvent something already in the codebase.

## Coding Conventions

- TypeScript strict mode always — no `any`, no `// @ts-ignore` without an explanation comment
- Named exports for all shared modules; default exports only for page-level route components
- `async/await` over promise chains
- Descriptive variable names — no abbreviations unless universally understood (`id`, `url`, `i`)
- No commented-out code blocks; no dead code
- Run lint with autofix after every change: `pnpm lint --fix` (or equivalent)
- No new npm packages without explicit user request

## React Patterns

### Never call a useState setter directly inside useEffect

Three approved alternatives:

**1. Derive during render** (preferred — no effect needed):
```tsx
// ❌ wrong
useEffect(() => setCount(items.length), [items])
// ✅ correct
const count = items.length
```

**2. Atomic state — update in event handler:**
```tsx
// ❌ wrong: resetting dependent state in effect
useEffect(() => setPage(0), [query])
// ✅ correct: update atomically in handler
const [search, setSearch] = useState({ query: '', page: 0 })
// on input: setSearch({ query: newQuery, page: 0 })
```

**3. setState-during-render with a guard (when async prop arrives):**
```tsx
// ✅ correct: sync form field when async `keys` prop arrives
const [prevKeys, setPrevKeys] = useState(keys)
if (prevKeys !== keys) {
  setPrevKeys(keys)
  setField(keys?.value ?? '')
}
```

### Other React rules
- Use custom hooks to extract reusable stateful logic — not copy-pasted effect blocks
- `useEffect` is for external system sync (DOM APIs, WebSocket, timers) — not derived state
- Use event handlers for event-driven side effects, not effects

## UI and Design Rules

**Tailwind CSS v4:**
- No `tailwind.config.js` or `tailwind.config.ts` — v4 uses `@tailwindcss/vite` plugin + CSS variables
- Use CSS custom properties for design tokens

**Class utilities:**
- Always use `clsx` + `tailwind-merge` via a `cn(...)` helper for conditional classes
- Never concatenate class strings with template literals

**ESLint / formatting:**
- `@antfu/eslint-config` — no Prettier, ever
- Do not add `.prettierrc`, `prettier.config.js`, or `prettier` to devDependencies

**shadcn/ui:**
- Never hand-edit files inside `components/ui/` — these are generated primitives
- Compose new components from shadcn primitives using `cva` for `variant`/`size` props

**Accessibility:**
- Semantic HTML5 elements (`<button>`, `<nav>`, `<main>`, `<section>`)
- All interactive elements must have visible focus states
- Images need `alt` text; icon-only buttons need `aria-label`
- Minimum color contrast 4.5:1

## File Placement Rules

- Don't create a new abstraction (hook, util, component) for a single one-off use
- Prefer editing an existing component over creating a near-duplicate
- Three similar lines of code is better than a premature abstraction
- No feature flags or backwards-compatibility shims — just change the code

## Testing and Quality

Before marking any task complete:
- [ ] `pnpm typecheck` passes (or `tsc --noEmit`)
- [ ] `pnpm lint` passes
- [ ] Relevant tests pass for modified logic

Testing rules:
- Add unit tests for reusable hooks, utilities, and pure functions
- Do not add heavy test scaffolding for simple presentational components
- Verify empty, loading, and error states where relevant
- Check responsive layout for any UI changes

## Skills Usage (if installed)

- `vercel-react-best-practices` — after modifying React components
- `ui-ux-pro-max-skill` — when designing or redesigning UI from scratch
- `shadcn` — when adding or composing shadcn/ui components
- `web-design-guidelines` — when auditing UI/UX quality
- `brainstorming` — before starting a new feature or large refactor

## Delivery Standards

Write components that are easy to test:
- **Single responsibility** — one component, one clear purpose; keep it small
- **Props over globals** — pass dependencies through props; avoid global state inside components
- **Pure functions** — extract business logic into pure functions with no side effects
- **Named functions** — extract complex inline logic to named handlers

Avoid test-hostile patterns:
- Don't hard-code API endpoints — use config/env variables
- Don't access the DOM directly — use React's declarative approach
- Don't tightly couple components to routing libraries

### State management hierarchy

Use the simplest option that works:
1. **Local state** — `useState` for UI-specific data (toggles, inputs)
2. **Lifted state** — share between siblings via common parent
3. **Context** — shared app-wide data (auth, settings, theme)
4. **URL state** — shareable/bookmarkable state via search params
5. **Server state** — API data with caching (React Query or similar)

Avoid Redux, Zustand, Jotai unless already in the project or explicitly requested.

## Frontend Best Practices

**Mobile-first:**
- Design for mobile first, enhance for larger screens
- Tap targets minimum 44×44px
- Use `rem`/`em`/`%` over fixed `px` for layout

**Error resilience:**
- Implement error boundaries around feature areas
- Show meaningful loading, empty, and error states — not blank screens
- User-facing errors should be clear and actionable, not technical

**Performance:**
- Avoid unnecessary re-renders — verify the need before adding `memo`/`useCallback`
- Lazy-load routes and heavy components with `React.lazy` + `Suspense`
- Don't add large dependencies for small utilities
```

- [ ] **Step 2: Verify the file exists, is under 150 lines, and has all 9 required sections**

```bash
wc -l ~/.claude/react-vite-ts.md
```
Expected: ≤ 150

```bash
grep -c "^## " ~/.claude/react-vite-ts.md
```
Expected: 9 (Explore Before You Code, Coding Conventions, React Patterns, UI and Design Rules, File Placement Rules, Testing and Quality, Skills Usage, Delivery Standards, Frontend Best Practices)

- [ ] **Step 3: No git commit needed**

The file lives at `~/.claude/` outside any git repo. Proceed to Task 2.

---

### Task 2: Update this project's CLAUDE.md to use the import

**Files:**
- Modify: `CLAUDE.md` (project root)

**Context:** The current `CLAUDE.md` starts with `# CLAUDE.md` on line 1, then has project overview prose, then several sections. The React Rules section (`## React Rules (enforced by ESLint)`) is a direct duplicate of content now in the shared file and should be removed. The title heading `# CLAUDE.md` and all project-specific sections (Project Overview, Architecture, Backend, Frontend, Routing, Styling) must be preserved.

- [ ] **Step 1: Read the current CLAUDE.md**

Read `CLAUDE.md` to confirm its current structure before modifying.

- [ ] **Step 2: Add the import as the very first line**

Insert `@~/.claude/react-vite-ts.md` as line 1, followed by a blank line, so the file begins:

```
@~/.claude/react-vite-ts.md

# CLAUDE.md
...
```

The existing `# CLAUDE.md` title heading stays — it is project-specific framing.

- [ ] **Step 3: Confirm the section exists, then remove it**

First verify the section is present (expected: `1`):

```bash
grep -c "^## React Rules" CLAUDE.md
```

Then remove `## React Rules (enforced by ESLint)` and everything after it through EOF — this section is the last section in the file. The result should end with the Styling section.

Keep everything else: Project Overview, Architecture, Backend, Frontend, Routing, Styling sections — those are all project-specific.

- [ ] **Step 4: Verify the final CLAUDE.md reads cleanly**

Confirm:
- Line 1 is `@~/.claude/react-vite-ts.md`
- `## React Rules (enforced by ESLint)` section is gone
- All other project sections (Project Overview, Architecture, etc.) are intact

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: import shared react-vite-ts rules into project CLAUDE.md

Adds @~/.claude/react-vite-ts.md import and removes the React Rules
section that is now covered by the shared file.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Verification Checklist

After both tasks:
- [ ] `~/.claude/react-vite-ts.md` exists and is ≤ 150 lines
- [ ] `grep -c "^## " ~/.claude/react-vite-ts.md` returns 9
- [ ] `CLAUDE.md` line 1 is `@~/.claude/react-vite-ts.md`
- [ ] `## React Rules (enforced by ESLint)` no longer appears in `CLAUDE.md`
- [ ] All project-specific sections still present in `CLAUDE.md`
- [ ] `git log --oneline -1` shows the commit message
