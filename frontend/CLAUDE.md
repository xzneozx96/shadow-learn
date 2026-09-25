@~/.claude/react-vite-ts.md

# Frontend CLAUDE.md

Supplements root CLAUDE.md — read it first. Commands, full architecture overview, context list, and React setState rules are defined there.

## Tech Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui · vitest + Testing Library · react-router-dom v7

Do NOT introduce: Redux, Zustand, React Query, Axios, or Prettier.

## Architecture Patterns

**Context access** — use React 19's `use()` hook, not `useContext()`.

**Server data** — get `db` from `useAuth()`, then call the typed accessors in `src/db/index.ts`. `db` is `null` before sign-in, so guard before use. For read-modify-write, use `updateRecord(db, store, id, mutate)` or `updateLessonMeta(db, meta, mutate)`, never a blind `put` of a copy you read earlier: on a 409 they rerun `mutate` on the record another device just wrote. Do not open IndexedDB. `src/db/legacy.ts` exists only for the one-time importer in `features/migration/` and must stay read-only.

**Video time subscriptions** — use `useTimeEffect(cb, deps)` from `src/shared/hooks/useTimeEffect.ts`. Do not call `PlayerContext.subscribeTime` manually in components.

**Provider keys** — live on the server. Settings can write a key but never reads one back, and no feature sends a key with its request: the backend resolves the account's key or the operator's fallback. Do not store a provider key in the browser.

## Testing and Quality Bar

Tests live in `frontend/tests/` and next to the code in `src/`. Run one file: `npx vitest tests/my.test.ts`.

- Test behavior, not implementation — no snapshot tests
- Hooks and `lib/` utilities should have tests; UI components don't require tests unless they contain logic
- Fake the server with `FakeApiClient` from `tests/fake-api.ts`; two `fakeDataClient(api)` over one `FakeApiClient` act as two devices
- `fake-indexeddb` is only for the legacy reader and importer tests in `tests/migration/`

## File and Component Placement

| What | Where |
|------|-------|
| New page | `src/app/pages/` |
| Feature component | `src/features/<feature>/ui/` |
| Feature hook or context | `src/features/<feature>/application/` |
| Feature types and pure logic | `src/features/<feature>/domain/` |
| UI primitive | `src/shared/ui/` via shadcn CLI only |
| Shared pure utility | `src/shared/lib/` |
| Shared hook | `src/shared/hooks/` |
| App-wide provider | `src/app/providers/` |
| Server accessor | `src/db/index.ts` |

Don't create a new file when editing an existing one would do. Don't create abstractions for single uses.

## Safe-Change Rules

Do not modify without careful review:

- `src/shared/ui/` — shadcn-managed, use CLI to update
- `src/db/index.ts` — every screen reads and writes through it; keep writes on `updateRecord` or `updateLessonMeta`
- `src/db/legacy.ts` — the importer reads v21 data through it; do not change the schema or add write helpers (`tests/migration/legacy-readonly.test.ts` fails on a `save`, `put`, `upsert`, `append`, or `delete` export)
- `src/app/providers/AuthContext.tsx` — gates the entire app; mistakes break all data access
- `src/features/migration/` — deletes the local legacy database only after a full manifest match; a bug here loses unimported data

---
