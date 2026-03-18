# Ruby Text Transcript Layout

**Date:** 2026-03-18
**Status:** Approved

## Problem

The current transcript panel displays three separate lines per segment: romanization, Chinese text, and translation. The romanization and text lines are visually decoupled — readers must mentally map each syllable to its character across two disconnected rows, which is slow and error-prone.

## Goal

Replace the two-line romanization+text display with a ruby text layout: each vocabulary word renders as a stacked unit with pinyin directly above its characters. The translation line is kept below, unchanged.

## Data Available

Every `Segment` already has a `words: Word[]` array produced by the LLM vocabulary pipeline. Each `Word` contains:

- `word` — the Chinese characters (may be multi-character, e.g. `上学`)
- `romanization` — the pinyin for that word group (e.g. `shàngxué`)
- `meaning`, `usage` — used in the tooltip popup (unchanged)

`buildWordSpans` in `lib/segment-text.ts` already walks the raw segment text and groups characters into word-aligned spans using the `words` array. No changes to this utility are needed.

## Design

### Granularity

Pinyin is displayed **per vocabulary word**, not per character. Multi-character words (e.g. `今天`, `星期四`) get a single pinyin label spanning their characters. This matches the LLM-produced groupings and produces natural, readable annotations.

Characters not matched to any vocabulary word (punctuation, particles not in the words list) render without a pinyin label.

### Ruby Unit

Each vocabulary word span renders as a vertical flex stack:

```
shàngxué          ← pinyin label (text-sm, text-muted-foreground — minimum font size per frontend convention)
上学              ← characters (text-lg inherited from root span, text-foreground)
```

The entire unit is the tooltip trigger. Use `TooltipTrigger asChild` with a `<span>` (not a `<div>`) as the ruby unit container to keep valid HTML inline content model. The `<span>` uses `inline-flex flex-col items-center`:

```tsx
<TooltipTrigger asChild>
  <span className="inline-flex flex-col items-center cursor-help ...">
    <span ref={...} className="text-sm text-muted-foreground">
      {span.word.romanization}
    </span>
    {charSpans}
  </span>
</TooltipTrigger>
```

### Font Sizes

- `text-lg` is placed on `SegmentText`'s root `<span>` so all content (word and non-word spans alike) inherits it. Remove `text-lg` from `TranscriptPanel`'s wrapper.
- Pinyin labels use `text-sm` (the project minimum) with `text-muted-foreground`.

### Karaoke Highlight

The existing `applyKaraoke` function calls `subscribeTime` directly (an acknowledged deviation from the `useTimeEffect` hook convention). The new pinyin-label pass is added **inside the same `applyKaraoke` function** to stay consistent with the existing pattern — do not introduce a second `subscribeTime` or `useTimeEffect` call.

**`posMapRef` / `buildPositionMap` key type:** `buildPositionMap(text, wordTimings)` returns a `Map<number, WordTiming>` keyed by absolute character offset in the segment text. Each character position that belongs to a `WordTiming` entry gets mapped to that entry. `spanStarts[i]` is the absolute character offset of span `i`'s first character — so `pm.get(spanStarts[i])` retrieves the `WordTiming` that covers the first character of span `i`, if one exists.

The highlight condition is based on the **first character** of the word span. When `pm.get(spanStarts[i])?.end <= time`, the entire word is considered spoken and both the char spans and the pinyin label highlight simultaneously. For multi-character words (e.g. `今天`), only the first character's timing is checked, giving a word-level feel.

The `applyKaraoke` function is also called immediately on mount with `getTime()` to avoid a flash of uncolored content. The new pinyin-label pass is part of the same function body and therefore automatically benefits from this existing initial paint call — no separate mount handling required.

The initial static `className` on the pinyin `<span>` is `"text-sm text-muted-foreground"`. The karaoke toggle adds/removes `text-yellow-400` and `text-muted-foreground`:

```ts
// inside applyKaraoke(time), after the existing charSpanRef loop:
spans.forEach((span, i) => {
  const el = wordPinyinRef.current[i]  // i = full-spans index (includes non-word slots which are null)
  if (!el || !span.word) return
  const firstCharWt = pm.get(spanStarts[i])   // pm = posMapRef.current (existing alias in applyKaraoke)
  if (firstCharWt === undefined) return
  const spoken = firstCharWt.end <= time
  el.classList.toggle('text-yellow-400', spoken)
  el.classList.toggle('text-muted-foreground', !spoken)
})
```

`pm` is the local alias already declared at the top of `applyKaraoke` as `const pm = posMapRef.current`. Use it directly — do not re-read `posMapRef.current`.

### Translation Line

Kept exactly as-is below the ruby line. No changes.

## Files Changed

### `frontend/src/components/lesson/SegmentText.tsx`

1. **Add `wordPinyinRef`** — `useRef<(HTMLSpanElement | null)[]>([])`, one slot **per span** from `buildWordSpans` (sized to `spans.length`, not `text.length` like `charSpanRef`). `spanStarts` is also per-span (same length as `spans`); `spanStarts[spanIdx]` is the absolute character offset of span `spanIdx`'s first character. The resize guard is written **inline during render** (same placement as the existing `charSpanRef` guard at lines 60–62):
   ```ts
   if (wordPinyinRef.current.length !== spans.length) {
     wordPinyinRef.current = Array.from({ length: spans.length }).fill(null) as (HTMLSpanElement | null)[]
   }
   ```
   `wordPinyinRef` is sized to `spans.length` — all spans, including non-word (null-word) spans. Non-word slots remain `null` because the ref callback is only placed on word spans (see render loop). The karaoke loop guards `if (!el || !span.word) return` to skip them.


3. **Update render loop** — the existing loop is `spans.map((span, spanIdx) => { const spanStart = spanStarts[spanIdx]; ... })`. `charSpans` is the existing per-character span array built just before the word/non-word branch:
   ```ts
   const charSpans = span.text.split('').map((char, j) => {
     const charIdx = spanStart + j
     return <span key={charIdx} ref={(el) => { charSpanRef.current[charIdx] = el }}>{char}</span>
   })
   ```
   Each character is still a separate `<span>` with its own `charSpanRef` ref keyed by absolute `charIdx`. Wrapping them in a flex container does not change these indices.

   Word spans become ruby units using `TooltipTrigger asChild` + an inline `<span>`. `spanIdx` is the full-spans index (0…spans.length-1), including non-word spans:
   ```tsx
   <Tooltip key={spanStart}>
     <TooltipTrigger asChild>
       <span
         className="inline-flex flex-col items-center cursor-help rounded-sm px-0.5 transition-colors hover:bg-white/10"
       >
         <span
           className="text-sm text-muted-foreground"
           ref={(el) => { wordPinyinRef.current[spanIdx] = el }}
         >
           {span.word.romanization}
         </span>
         {charSpans}
       </span>
     </TooltipTrigger>
     <TooltipContent ...>{/* unchanged */}</TooltipContent>
   </Tooltip>
   ```
   Non-word spans (punctuation, unmatched chars) render as before — `<span key={spanStart}>{charSpans}</span>`, no pinyin row, no tooltip.

2. **Add `text-lg` to root `<span>`** — `SegmentText` returns `<TooltipProvider><span>{spans.map(...)}</span></TooltipProvider>`. Add `className="text-lg"` to the inner `<span>`. This is an inline element; ruby units inside it are `inline-flex` and will lay out horizontally by default, which is correct. No `block` or `inline-block` needed on the root span.

4. **Update `applyKaraoke`** — add the word-level pinyin pass after the existing char loop as shown in the Karaoke Highlight section above.

### `frontend/src/components/lesson/TranscriptPanel.tsx`

1. **Remove standalone romanization line** — delete:
   ```tsx
   {segment.romanization && <p className="mb-1 text-muted-foreground">{segment.romanization}</p>}
   ```

2. **Replace `<p>` wrapper** — the current wrapper is `<p className="text-lg text-foreground">` (only those two classes, no margin or padding). `text-lg` moves to `SegmentText`'s root span (see above). Replace the `<p>` with a plain `<div>` keeping only `text-foreground`:
   ```tsx
   <div className="text-foreground">
     <SegmentText ... />
   </div>
   ```

## What Does Not Change

- `buildWordSpans` and `buildPositionMap` in `lib/segment-text.ts`
- Tooltip popup content (word, pinyin, meaning, usage)
- TTS play button per word
- Save to Workbook button
- Per-character `charSpanRef` and karaoke timing
- `applyKaraoke` structure and initial `getTime()` call on mount
- Active segment highlight, auto-scroll, search
- Language toggle, copy button, shadow button
- Translation line display

## Out of Scope

- Shadowing panel, study exercises — these do not use `SegmentText`
- Segment-level `romanization` field on `Segment` — still stored, just not displayed as a separate line
- Correcting the `subscribeTime` deviation to `useTimeEffect` — out of scope for this change
