# Ruby Text Transcript Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-line transcript layout (separate romanization / Chinese text / translation) with a Ruby Text layout where pinyin is stacked directly above each vocabulary-word group.

**Architecture:** Two files change. `SegmentText.tsx` gains a `wordPinyinRef` (one slot per span) and renders word spans as `inline-flex flex-col` ruby units with pinyin above characters. The karaoke `applyKaraoke` function gets a second pass that toggles pinyin label color using the first-character `WordTiming`. `TranscriptPanel.tsx` drops the segment-level romanization line and removes `text-lg` from its wrapper (it moves to `SegmentText`'s root span).

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui Tooltip primitives

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/lesson/SegmentText.tsx` | Add `wordPinyinRef`, update render loop to ruby units, add `text-lg` to root span, extend `applyKaraoke` |
| `frontend/src/components/lesson/TranscriptPanel.tsx` | Remove romanization `<p>`, replace `<p className="text-lg text-foreground">` with `<div className="text-foreground">` |

No other files change. `lib/segment-text.ts`, tooltip content, TTS, workbook, and karaoke char refs are all untouched.

---

## Task 1: Add `wordPinyinRef` (and span refs) to SegmentText

**Files:**
- Modify: `frontend/src/components/lesson/SegmentText.tsx:52-62`

- [ ] **Step 1: Store `spans` and `spanStarts` in refs; add `wordPinyinRef` with resize guard**

  `applyKaraoke` is defined inside a `useEffect` with deps `[subscribeTime, getTime]`. It must not close directly over render-scope variables `spans` and `spanStarts` — those would go stale if `text`/`words` ever changed without a remount. Follow the same pattern used for `posMapRef`: write the value to a ref inline during render so the closure always reads the latest value.

  After the existing `posMapRef` block (lines 52–54), and before the `charSpanRef` block (lines 57–62), add:

  ```tsx
  // Keep spans/spanStarts in refs so the applyKaraoke closure always reads fresh values.
  // (applyKaraoke's useEffect only re-runs when subscribeTime/getTime change.)
  const spansRef = useRef(spans)
  spansRef.current = spans
  const spanStartsRef = useRef(spanStarts)
  spanStartsRef.current = spanStarts
  ```

  Then after the existing `charSpanRef` guard block (lines 58–62), add:

  ```tsx
  // One ref slot per span (including non-word spans — those slots stay null)
  const wordPinyinRef = useRef<(HTMLSpanElement | null)[]>([])
  if (wordPinyinRef.current.length !== spans.length) {
    wordPinyinRef.current = Array.from({ length: spans.length }).fill(null) as (HTMLSpanElement | null)[]
  }
  ```

  The `wordPinyinRef` guard is placed inline during render, immediately after the `charSpanRef` guard — same pattern, same location.

- [ ] **Step 2: Verify the file compiles**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: no errors relating to `wordPinyinRef`.

---

## Task 2: Update render loop — word spans become ruby units

**Files:**
- Modify: `frontend/src/components/lesson/SegmentText.tsx:110-183`

- [ ] **Step 1: Replace the word-span branch with a ruby unit**

  The current word-span branch (lines 110–183) uses `TooltipTrigger` without `asChild`:

  ```tsx
  // BEFORE
  <TooltipTrigger className="cursor-help rounded-sm px-0.5 text-inherit ...">
    {charSpans}
  </TooltipTrigger>
  ```

  Replace with `asChild` + a `<span>` ruby unit that stacks the pinyin label above `{charSpans}`:

  ```tsx
  // AFTER
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
  ```

  Everything inside `<TooltipContent>` (the popup content with word, meaning, usage, TTS/copy/save buttons) remains **exactly as-is**.

  Non-word spans (the `if (!span.word)` branch at line 106–108) are **not changed** — they render `<span key={spanStart}>{charSpans}</span>` as before.

- [ ] **Step 2: Add `className="text-lg"` to the root `<span>` in the return**

  The current return (line 88–187):

  ```tsx
  return (
    <TooltipProvider>
      <span>
        {spans.map(...)}
      </span>
    </TooltipProvider>
  )
  ```

  Add `className="text-lg"` to the inner `<span>`:

  ```tsx
  return (
    <TooltipProvider>
      <span className="text-lg">
        {spans.map(...)}
      </span>
    </TooltipProvider>
  )
  ```

- [ ] **Step 3: Verify the file compiles**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: no errors.

---

## Task 3: Extend `applyKaraoke` with pinyin-label pass

**Files:**
- Modify: `frontend/src/components/lesson/SegmentText.tsx:68-86`

- [ ] **Step 1: Add the pinyin pass inside `applyKaraoke`**

  The current `applyKaraoke` function ends after the `charSpanRef.current.forEach` loop (line 82). Add the word-level pinyin pass immediately after that loop, before the closing `}` of `applyKaraoke`:

  ```ts
  // Word-level pinyin highlight — checked against first character's WordTiming
  const currentSpans = spansRef.current
  const currentSpanStarts = spanStartsRef.current
  currentSpans.forEach((span, i) => {
    const el = wordPinyinRef.current[i]
    if (!el || !span.word)
      return
    const firstCharWt = pm.get(currentSpanStarts[i])
    if (firstCharWt === undefined)
      return
    const spoken = firstCharWt.end <= time
    el.classList.toggle('text-yellow-400', spoken)
    el.classList.toggle('text-muted-foreground', !spoken)
  })
  ```

  Use `pm` (the existing `const pm = posMapRef.current` alias at the top of `applyKaraoke`). Use `spansRef.current` and `spanStartsRef.current` — not the bare render-scope `spans`/`spanStarts` — to avoid stale closure values.

  The `applyKaraoke(getTime())` call on mount (line 84) already covers the pinyin labels — no separate mount logic needed.

- [ ] **Step 2: Verify the file compiles**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit SegmentText changes**

  ```bash
  git add frontend/src/components/lesson/SegmentText.tsx
  git commit -m "feat(transcript): add ruby text layout with per-word pinyin labels and karaoke highlight"
  ```

---

## Task 4: Update TranscriptPanel — remove romanization line and fix wrapper

**Files:**
- Modify: `frontend/src/components/lesson/TranscriptPanel.tsx:173-187`

- [ ] **Step 1: Remove the standalone romanization line**

  Delete line 173:

  ```tsx
  // DELETE THIS LINE:
  {segment.romanization && <p className="mb-1 text-muted-foreground">{segment.romanization}</p>}
  ```

- [ ] **Step 2: Replace the `<p>` wrapper with `<div>`**

  The current wrapper (line 174) is:

  ```tsx
  <p className="text-lg text-foreground">
  ```

  Replace with (drop `text-lg`, it now lives on `SegmentText`'s root span):

  ```tsx
  <div className="text-foreground">
  ```

  Close tag changes from `</p>` to `</div>` accordingly (line 187).

- [ ] **Step 3: Verify the file compiles**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit TranscriptPanel changes**

  ```bash
  git add frontend/src/components/lesson/TranscriptPanel.tsx
  git commit -m "feat(transcript): remove segment-level romanization line; text-lg now on SegmentText root"
  ```

---

## Task 5: Visual verification

- [ ] **Step 1: Run the dev server**

  ```bash
  cd frontend && npm run dev
  ```

- [ ] **Step 2: Open a lesson with Chinese content and verify**

  Check:
  - Each vocabulary word shows pinyin label (`text-sm`, muted) stacked above its characters (`text-lg` inherited)
  - Multi-character words (e.g. 今天, 星期四) show a single combined pinyin label spanning all characters
  - Punctuation and unmatched chars render without a pinyin row (no empty row above them)
  - Hovering a word unit shows the tooltip popup with word/meaning/usage/TTS/save — unchanged
  - The segment-level romanization line (previously a separate `<p>`) is gone
  - Translation line still appears below the ruby text, unchanged

- [ ] **Step 3: Verify karaoke (if video has word timings)**

  Play a video with word timings. Confirm:
  - Characters turn `text-yellow-400` as they are spoken (existing behavior preserved)
  - Pinyin label simultaneously turns `text-yellow-400` when the word's first character is spoken
  - Pinyin label returns to `text-muted-foreground` color before the word is spoken

---

## Checklist Summary

| Task | Description |
|------|-------------|
| 1 | Add `wordPinyinRef` declaration + inline resize guard |
| 2 | Update render loop: ruby unit with pinyin above chars; `text-lg` on root span |
| 3 | Extend `applyKaraoke` with pinyin-label color pass; commit |
| 4 | TranscriptPanel: remove romanization `<p>`, replace `<p>` wrapper with `<div>`; commit |
| 5 | Visual verification in dev server |
