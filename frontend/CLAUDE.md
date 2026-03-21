@~/.claude/react-vite-ts.md

# Frontend CLAUDE.md

Supplements root CLAUDE.md — read it first. Commands, full architecture overview, context list, and React setState rules are defined there.

## Tech Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui · vitest + Testing Library · react-router-dom v7

Do NOT introduce: Redux, Zustand, React Query, Axios, or Prettier.

## Architecture Patterns

**Context access** — use React 19's `use()` hook, not `useContext()`.

**IndexedDB** — never call `openDB` directly. Get `db` from `AuthContext`, then call typed functions from `src/db/index.ts`. `db` is `null` while locked — always guard before use.

**Video time subscriptions** — use `useTimeEffect(cb, deps)` from `src/hooks/useTimeEffect.ts`. Do not call `PlayerContext.subscribeTime` manually in components.

**External API keys** — come from `AuthContext.keys`. Always guard `if (!keys)` before calling OpenRouter, Deepgram, Azure, or Minimax.

## Testing and Quality Bar

Tests live in `frontend/tests/`. Run one file: `npx vitest tests/my.test.ts`.

- Test behavior, not implementation — no snapshot tests
- Hooks and `lib/` utilities should have tests; UI components don't require tests unless they contain logic
- If IDB access is needed in tests, use `fake-indexeddb`

## File and Component Placement

| What | Where |
|------|-------|
| New page | `src/pages/` |
| Feature component | `src/components/<feature>/` |
| UI primitive | `src/components/ui/` via shadcn CLI only |
| Pure utility | `src/lib/` |
| Data/feature hook | `src/hooks/` |
| Context provider | `src/contexts/` |

Don't create a new file when editing an existing one would do. Don't create abstractions for single uses.

## Safe-Change Rules

Do not modify without careful review:

- `src/components/ui/` — shadcn-managed, use CLI to update
- `src/db/index.ts` — schema changes require a `DB_VERSION` bump and new `upgrade()` migration branch
- `src/contexts/AuthContext.tsx` — gates the entire app; mistakes break all data access
- `src/lib/crypto.ts` — encryption bugs silently corrupt user data

---
