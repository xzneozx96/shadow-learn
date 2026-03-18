# Lesson Workbook Panel Design

## Goal

Add a "Workbook" tab to the right-side Companion Panel in the lesson view, giving users quick access to vocabulary they've saved from the current lesson and a one-tap path into a study session — without leaving the lesson.

## Architecture

The existing `CompanionPanel` grows a tab bar with two tabs: **AI Companion** (existing) and **Workbook** (new). Tab state is local to `CompanionPanel`. A new `LessonWorkbookPanel` component renders the workbook tab content. `LessonView` passes `lessonId` down to `CompanionPanel` as a new prop; no other data needs to be threaded through.

## Components

### `CompanionPanel.tsx` (modified)

All existing props (`messages`, `isStreaming`, `onSend`, `activeSegment`, `model`, `onModelChange`) are preserved unchanged. One new prop is added:

- New prop: `lessonId: string`

The existing plain header is replaced by a shadcn `<Tabs>` component (`@/components/ui/tabs`) using the `"line"` variant on `<TabsList>`:

```tsx
<Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'ai' | 'workbook')}>
  <TabsList variant="line" className="w-full px-3">
    <TabsTrigger value="ai">AI Companion</TabsTrigger>
    <TabsTrigger value="workbook">
      Workbook {count > 0 && <Badge>{count}</Badge>}
    </TabsTrigger>
  </TabsList>
  <TabsContent value="ai">
    {/* existing context pill + messages + input */}
  </TabsContent>
  <TabsContent value="workbook">
    <LessonWorkbookPanel lessonId={lessonId} />
  </TabsContent>
</Tabs>
```

`count` is `(useVocabulary().entriesByLesson[lessonId] ?? []).length`, read at the top of `CompanionPanel`.

Default tab: `'ai'`. Tab selection is local state; it resets on unmount (no persistence needed).

### `LessonWorkbookPanel.tsx` (new)

Props: `{ lessonId: string }`

Calls `useVocabulary()` independently for the full entry list. Both this component and `CompanionPanel` call `useVocabulary()` independently — each maintains its own local state backed by the same IndexedDB store. Both instances will reflect the same persisted data after their initial async load; no flicker or stale-badge risk because vocabulary mutations (save/remove) are initiated by `TranscriptPanel`, which triggers a re-read in both hook instances via the `db.getAll` effect.

Renders:

**Sub-header row**
- Left: `"N words saved"` in muted text
- Right: `"View all →"` as `<Link to="/vocabulary">` — navigates to the global unfiltered workbook page; scoping this link to the current lesson's section is out of scope

**Word grid**
- `ScrollArea` wrapping a `grid grid-cols-2 gap-2` container
- Each cell: achromatic glass card (`bg-card border border-border rounded-lg p-3 cursor-pointer hover:bg-accent/40 transition-colors`)
  - Big Chinese character (`text-2xl font-bold text-foreground`)
  - Pinyin below (`text-sm text-muted-foreground`)
  - English meaning below (`text-sm text-muted-foreground/70 line-clamp-2`)
- Clicking a card calls `navigate(\`/lesson/${lessonId}?segmentId=${entry.sourceSegmentId}\`)` — the existing `deepLinkSegmentId` effect in `LessonView` re-fires because the `segmentId` search param changes, causing the player to seek and the transcript to scroll. **Known limitation:** clicking the same card twice while `?segmentId=X` is already the current URL will not re-seek (the effect dependency hasn't changed). This is acceptable for this scope.

**Empty state** (when 0 words saved)
- Vertically centered message: `"Hover any word in the transcript and tap the bookmark to save it here"`

**Study button** (outside the scroll area, pinned to bottom)
- Label: `"Study This Lesson →"`
- When count is 0: `disabled`, wrapped in a `<Tooltip>` showing `"Save at least one word first"`
- When count > 0: calls `navigate(\`/vocabulary/${lessonId}/study\`)`

### `LessonView.tsx` (modified)

Pass `lessonId={id ?? ''}` to `<CompanionPanel>`.

## Data Flow

```
LessonView (has id from useParams)
  └─ CompanionPanel(lessonId, ...existingProps)
       ├─ useVocabulary() → badge count
       ├─ AI tab: existing context pill + messages + input unchanged
       └─ Workbook tab: LessonWorkbookPanel(lessonId)
            └─ useVocabulary() → entriesByLesson[lessonId]
```

## Deep-link Navigation

Clicking a word card pushes:
```
/lesson/<lessonId>?segmentId=<entry.sourceSegmentId>
```
This is the current route with updated search params. React Router does not remount `LessonView`, but the `deepLinkSegmentId` value changes, re-firing the seek/scroll effect. Second click on the same card while the param is unchanged does nothing (documented limitation above).

## Edge Cases

- **0 words**: empty state shown; Study button disabled with tooltip
- **lessonId missing or empty**: `entriesByLesson['']` is `undefined` → treated as `[]`
- **Tab state**: resets to `'ai'` on unmount — intentional, no persistence

## Files

| File | Change |
|------|--------|
| `frontend/src/components/lesson/CompanionPanel.tsx` | Add `lessonId` prop; replace header with `<Tabs variant="line">`; add `useVocabulary()` for badge count |
| `frontend/src/components/lesson/LessonWorkbookPanel.tsx` | New component |
| `frontend/src/components/lesson/LessonView.tsx` | Pass `lessonId={id ?? ''}` to `<CompanionPanel>` |
