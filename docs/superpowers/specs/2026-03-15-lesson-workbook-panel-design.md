# Lesson Workbook Panel Design

## Goal

Add a "Workbook" tab to the right-side Companion Panel in the lesson view, giving users quick access to vocabulary they've saved from the current lesson and a one-tap path into a study session — without leaving the lesson.

## Architecture

The existing `CompanionPanel` grows a tab bar with two tabs: **AI Companion** (existing) and **Workbook** (new). Tab state is local to `CompanionPanel`. A new `LessonWorkbookPanel` component renders the workbook tab content. `LessonView` passes `lessonId` down to `CompanionPanel` as a new prop; no other data needs to be threaded through.

## Components

### `CompanionPanel.tsx` (modified)

- New prop: `lessonId: string`
- New local state: `activeTab: 'ai' | 'workbook'`, defaults to `'ai'`
- The existing header (`"AI Companion"` label) is replaced by a tab bar:
  - Two tabs: `AI Companion` | `Workbook`
  - The Workbook tab shows a badge with the saved word count for this lesson (read from `useVocabulary()`)
  - Active tab has an underline indicator; inactive tab is muted
- When `activeTab === 'ai'`: renders the existing context pill + messages + input area unchanged
- When `activeTab === 'workbook'`: renders `<LessonWorkbookPanel lessonId={lessonId} />`

### `LessonWorkbookPanel.tsx` (new)

Props: `{ lessonId: string }`

Reads `entriesByLesson[lessonId]` from `useVocabulary()`. Renders:

**Sub-header row**
- Left: `"N words saved"` in muted text
- Right: `"View all →"` as a `<Link to="/vocabulary">` in muted text

**Word grid**
- `ScrollArea` wrapping a 2-column CSS grid
- Each cell: achromatic glass card (`bg-card border border-border rounded-lg`)
  - Big Chinese character (`text-2xl font-bold`)
  - Pinyin below (`text-xs text-muted-foreground`)
  - English meaning below (`text-xs text-muted-foreground/70`)
- Clicking a card navigates to the lesson view with `?segmentId=<sourceSegmentId>`, which triggers the existing deep-link mechanism (seeks player, scrolls transcript)

**Empty state** (when 0 words saved)
- Centered message: `"Hover any word in the transcript and tap the bookmark to save it here"`

**Study button** (pinned to bottom, outside the scroll area)
- Label: `"Study This Lesson →"`
- Disabled with tooltip `"Save at least one word first"` when count is 0
- Navigates to `/vocabulary/:lessonId/study` when enabled

### `LessonView.tsx` (modified)

Pass `lessonId={id ?? ''}` to `<CompanionPanel>`.

## Data Flow

```
LessonView (has id from useParams)
  └─ CompanionPanel(lessonId)
       ├─ AI tab: existing messages/onSend/activeSegment props
       └─ Workbook tab: LessonWorkbookPanel(lessonId)
            └─ useVocabulary() → entriesByLesson[lessonId]
```

`useVocabulary` is called in two places within `CompanionPanel`'s subtree:
1. In `CompanionPanel` itself to read the badge count
2. In `LessonWorkbookPanel` for the full entry list

Both calls share the same IndexedDB data; the hook is lightweight (reads from cached state).

## Deep-link Navigation

Clicking a word card in the Workbook tab uses `useNavigate` to push:
```
/lesson/<lessonId>?segmentId=<entry.sourceSegmentId>
```
This reuses the `deepLinkSegmentId` effect already in `LessonView` — the player seeks and the transcript scrolls to the source segment automatically.

## Error / Edge Cases

- **0 words**: empty state message shown; Study button disabled
- **lessonId missing**: `entriesByLesson['']` is `undefined` → treated as empty array
- **Tab memory**: tab selection resets to `'ai'` on unmount (local state, intentional — no persistence needed)

## Files

| File | Change |
|------|--------|
| `frontend/src/components/lesson/CompanionPanel.tsx` | Add `lessonId` prop, tab bar, conditional render |
| `frontend/src/components/lesson/LessonWorkbookPanel.tsx` | New component |
| `frontend/src/components/lesson/LessonView.tsx` | Pass `lessonId` to `CompanionPanel` |
