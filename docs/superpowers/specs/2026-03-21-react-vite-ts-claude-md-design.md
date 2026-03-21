# Design: Reusable CLAUDE.md for React + Vite + TypeScript Projects

**Date:** 2026-03-21
**Status:** Revised

## Summary

A reusable `~/.claude/react-vite-ts.md` file that can be `@import`-ed into any React + Vite + TypeScript project's `CLAUDE.md`. It encodes senior-engineer-level rules, React best practices, and styling conventions so Claude consistently follows the right patterns without being corrected repeatedly.

## Motivation

Key pain points this file addresses:
- **D** — Claude ignores existing patterns and reinvents things already in the codebase
- **A** — Claude misuses `useEffect` (syncing derived state, side effects that should be events)
- **E** — Claude gets styling wrong (wrong Tailwind version, introduces Prettier, wrong class utilities)

## File Location

```
~/.claude/react-vite-ts.md
```

Imported per-project via:
```md
@~/.claude/react-vite-ts.md
```

## Structural Decision: No Zone 1 Template Headings

CLAUDE.md `@import` is text concatenation — there is no heading-override mechanism. Duplicate headings both appear. Therefore:

- The shared file contains **only fixed rules** (Zone 2). No `## Project Overview`, `## Architecture`, or `## Commands` headings.
- Instead, the file opens with a **prose directive** telling Claude where to find project-specific context: _"The importing CLAUDE.md defines Project Overview, Tech Stack, Architecture, and Commands. Read those sections first; the rules below apply on top of them."_
- The importing project's CLAUDE.md is responsible for all project-specific sections.

This eliminates the duplicate-heading problem and the false template-override model.

## Usage Pattern

```md
# my-project/CLAUDE.md

@~/.claude/react-vite-ts.md

## Project Overview
This is a Chinese language learning platform...

## Tech Stack
- React 19, Vite, TypeScript (strict)
- Tailwind CSS v4
- shadcn/ui, clsx, tailwind-merge
- @antfu/eslint-config (no Prettier)

## Architecture
- `src/components/` — UI components by feature
- `src/hooks/` — data-fetching and feature hooks
- `src/lib/` — pure utilities
- `src/contexts/` — React context providers

## Commands
- Dev: `pnpm dev`
- Lint: `pnpm lint`
- Test: `pnpm test`
```

## Fixed Sections (Zone 2)

| Section | Content | Approx lines |
|---|---|---|
| Prose directive | Tell Claude to read project CLAUDE.md sections first | 3 |
| `## Explore Before You Code` | Read existing code before proposing; don't reinvent found patterns | 8 |
| `## Coding Conventions` | Strict TS, no `any`, named exports, async/await, descriptive names, no commented-out blocks, autofix lint on changes | 12 |
| `## React Patterns` | useEffect rules + 3 snippets (derive-during-render, atomic state, setState-with-guard) | 45 |
| `## UI and Design Rules` | Tailwind v4 (no tailwind.config.js), no Prettier, clsx+twMerge, never edit `components/ui/`, shadcn patterns, a11y basics | 15 |
| `## File Placement Rules` | No one-off abstractions; prefer editing over duplicating | 6 |
| `## Testing and Quality` | Typecheck + lint + tests before done; unit tests for reusable logic; verify empty/loading/error states | 10 |
| `## Skills Usage` | Gated: "if installed" — vercel-react-best-practices, ui-ux-pro-max-skill, shadcn, web-design-guidelines | 8 |
| `## Delivery Standards` | Testability: component isolation, pure functions, dependency injection, avoid test-hostile patterns | 20 |
| `## Frontend Best Practices` | Mobile-first, state hierarchy (local→global→server→URL), error resilience | 15 |
| **Total** | | **~142 lines** |

> Line budget raised to ~150. The React Patterns section with three annotated snippets requires ~45 lines to be unambiguous — this is the most valuable section and should not be cut.

## React Patterns Section Detail

Three approved alternatives to calling `useState` setter inside `useEffect`:

1. **Derive during render** — compute from ref/state/props inline, no effect needed
2. **Atomic state** — merge related state into one object, update in event handler
3. **setState-during-render with guard** — track `prev` ref to prevent infinite loops; React re-renders immediately and only once more

Each alternative gets a 4–6 line annotated snippet. This section also covers:
- Prefer custom hooks for reusable logic over copy-pasted effect blocks
- Avoid `useEffect` for event-driven side effects — use event handlers

## Skills Usage Portability

The `## Skills Usage` section lists skills as optional. Format:

```md
## Skills Usage (if installed)
- `vercel-react-best-practices` — after modifying React components
- `ui-ux-pro-max-skill` — when designing or redesigning UI from scratch
- `shadcn` — when adding or composing shadcn components
- `web-design-guidelines` — when auditing UI/UX
- `brainstorming` — before starting a new feature or large refactor
```

Users without these skills installed will see no harm — the instructions are advisory.

## Success Criteria

Verifiable from diffs and output:
- No new state management library (Redux, Zustand, Jotai) added unless already in `package.json`
- No `prettier` or `.prettierrc` added to the project
- No direct edit to files inside `components/ui/` unless explicitly requested
- No `tailwind.config.js` or `tailwind.config.ts` created
- No `useEffect` containing only a `setState` call for derived data (derivable from props/state)
- No new npm package added without explicit user request
- File stays under 150 lines
