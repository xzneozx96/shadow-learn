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
shàngxué          ← pinyin label (text-xs, muted color)
上学              ← characters (text-lg, normal color)
```

The entire unit is the tooltip trigger (hover to see meaning popup). This is identical to the current behaviour where the character span is the trigger.

### Karaoke Highlight

When the video plays and a word's first character has been spoken (`wordTiming.end <= currentTime`), both the pinyin label and the characters highlight simultaneously. The existing per-character `charSpanRef` mechanism is preserved unchanged. A new `wordPinyinRef` array (one slot per word span) enables direct DOM toggling of the pinyin label color without React re-renders.

### Translation Line

Kept exactly as-is below the ruby line. No changes.

## Files Changed

### `frontend/src/components/lesson/SegmentText.tsx`

1. **Add `wordPinyinRef`** — `useRef<(HTMLSpanElement | null)[]>([])`, one slot per span from `buildWordSpans`. Slots for non-word spans hold `null`. Array is resized when span count changes (same pattern as `charSpanRef`).

2. **Update render loop** — word spans become ruby units:
   ```tsx
   <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
     <span ref={(el) => { wordPinyinRef.current[spanIdx] = el }}>
       {span.word.romanization}
     </span>
     {charSpans}  {/* existing char spans with charSpanRef intact */}
   </div>
   ```
   Non-word spans render as before (plain char spans, no pinyin row).

3. **Update karaoke effect** — after the existing char-coloring loop, add a word-level pass:
   ```ts
   spans.forEach((span, i) => {
     const el = wordPinyinRef.current[i]
     if (!el || !span.word) return
     const firstCharWt = pm.get(spanStarts[i])
     if (firstCharWt === undefined) return
     const spoken = firstCharWt.end <= time
     el.classList.toggle('text-yellow-400', spoken)
     el.classList.toggle('text-muted-foreground', !spoken)
   })
   ```

### `frontend/src/components/lesson/TranscriptPanel.tsx`

1. **Remove standalone romanization line** — delete:
   ```tsx
   {segment.romanization && <p className="mb-1 text-muted-foreground">{segment.romanization}</p>}
   ```
   Pinyin is now embedded in the ruby units rendered by `SegmentText`.

2. **Remove `<p>` wrapper around `<SegmentText>`** — the component now renders block-level ruby units, not inline text within a paragraph.

## What Does Not Change

- `buildWordSpans` and `buildPositionMap` in `lib/segment-text.ts`
- Tooltip popup content (word, pinyin, meaning, usage)
- TTS play button per word
- Save to Workbook button
- Per-character `charSpanRef` and karaoke timing
- Active segment highlight, auto-scroll, search
- Language toggle, copy button, shadow button
- Translation line display

## Out of Scope

- Shadowing panel, study exercises — these do not use `SegmentText`
- Segment-level `romanization` field on `Segment` — still stored, just not displayed as a separate line
