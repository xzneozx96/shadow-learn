# Exercise Components Redesign

**Date**: 2026-03-16
**Status**: Approved
**Scope**: All 5 study exercise components + shared ProgressBar

---

## Problem

The 5 exercise components (`ClozeExercise`, `DictationExercise`, `PinyinRecallExercise`, `ReconstructionExercise`, `PronunciationReferee`) are visually inconsistent:

- Inconsistent spacing scales (mb-3, mb-4, mb-5 mixed arbitrarily)
- Mixed use of native `<input>` and shadcn `Input` component
- Action button layouts differ per component (some centered, some space-between)
- No shared visual language between exercise types
- `PronunciationReferee` score layout diverges from the existing `ShadowingRevealPhase` scoring UI

---

## Design: Structured Sections (Option B)

Every exercise card follows the same **three-zone structure**:

```
┌─────────────────────────────────────────┐
│ HEADER  ● Exercise Type         n / 10  │  ← border-bottom
├─────────────────────────────────────────┤
│                                         │
│  BODY   exercise-specific content       │  ← 20px padding
│                                         │
├─────────────────────────────────────────┤
│ FOOTER  Skip              Check →       │  ← border-top
└─────────────────────────────────────────┘
```

Fully achromatic. No per-type color accents. Consistent use of shadcn/ui components throughout.

---

## Shared Card Shell

**Outer wrapper** (`<Card>` or equivalent div):
- `rounded-xl border border-border bg-card overflow-hidden`

**Header** (`CardHeader` or `<div>`):
- `flex items-center gap-2.5 px-[18px] py-3 border-b border-border`
- Left: 7×7px dot (`rounded-full bg-muted-foreground/50`) + exercise type label (`text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/90`)
- Right: progress counter (`text-[11px] text-muted-foreground ml-auto`) — e.g. `3 / 10`

**Body** (`CardContent` or `<div>`):
- `px-[18px] py-5`

**Footer** (`CardFooter` or `<div>`):
- `flex items-center justify-center gap-3 p-3 border-t border-border`
- Left: shadcn `<Button variant="ghost" size="sm">Skip</Button>`
- Right: shadcn `<Button size="sm">Check →</Button>` (or `Next →` post-check)

**Cloze exception**: footer uses `justify-center gap-3` instead of `justify-between`.

---

## Shared Feedback Block

Used after Check is pressed, identical across all exercise types. Rendered inside Body, above the footer.

```tsx
// Correct
<div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
  ✓ Correct!
</div>

// Incorrect
<div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
  ✗ Incorrect — expected "{answer}"
</div>
```

---

## Per-Exercise Body Content

### PinyinRecallExercise
1. Large Chinese word: `text-[52px] font-extrabold tracking-widest text-center py-2`
2. Meaning: `text-sm text-muted-foreground text-center mb-5`
3. shadcn `<Input className="text-center" placeholder="Type pinyin with tones…" />`
4. Hint: `text-[11px] text-muted-foreground/50 text-center mt-1.5`
5. Feedback block (post-check)

### DictationExercise
1. Instruction: `text-sm text-muted-foreground mb-4`
2. TTS play button: 56×56px `rounded-full` button with speaker icon, centered, `mx-auto mb-5`
3. shadcn `<Input placeholder="Type what you heard…" />`
4. Feedback block (post-check)

**Footer exception** (like Cloze's `justify-center`): left side holds two buttons — `Skip` (ghost) + `Pinyin mode` (ghost) — right side holds the primary `Check → / Next →` button. Layout remains `justify-between`.

### ClozeExercise
1. Story paragraph: `rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm leading-[2.4]`
2. Inline blanks inside the paragraph: native `<input>` styled as `inline-block w-14 text-center text-sm border-0 border-b border-border/60 bg-transparent mx-1 px-1 outline-none`; post-check: `border-emerald-500/50 text-emerald-400` or `border-destructive/50 text-destructive`
3. Footer: centered Skip + Check →
4. Per-blank feedback blocks rendered inside Body, below the story paragraph (post-check), one per blank — same green/red styles as the shared feedback block

### ReconstructionExercise
1. Context link (lesson source): `inline-flex items-center gap-1.5 text-sm text-muted-foreground border border-border/50 rounded-full px-2.5 py-1 mb-3 hover:text-foreground`
2. Instruction: `text-sm text-muted-foreground mb-3`
3. Word chips: `flex flex-wrap gap-2 mb-4` — each chip: `px-3 py-1.5 rounded-md text-sm font-semibold border border-border bg-secondary` with `opacity-25` when consumed
4. shadcn `<Input className="text-base tracking-wide" placeholder="Type the sentence…" />`
5. Post-check diff: `mt-3 px-3 py-2 rounded-lg bg-muted/30 text-lg font-bold tracking-wider` with green/red per char

### PronunciationReferee

**Before recording:**
1. Sentence display: `rounded-lg border border-border bg-muted/20 p-4 text-center mb-4` — Chinese (`text-xl font-bold tracking-widest`) + translation (`text-sm text-muted-foreground mt-1`)
2. Controls row: `flex gap-2` — Record button (`flex-1`, destructive variant while idle, stop on recording) + Playback button (outline, disabled until blob exists)
3. Footer: Skip (ghost) + Submit → (disabled until blob exists)

**After scoring (mirrors `ShadowingRevealPhase > SpeakingScores`):**
1. Score panel: `rounded-xl border border-border/50 bg-muted/20 overflow-hidden`
   - Hero row: big accuracy number (`text-3xl font-bold`) + `text-[10px] uppercase tracking-widest text-muted-foreground` label + verdict string (same color as score)
   - Secondary grid: 3 columns (fluency / completeness / prosody), `border-t border-border/40`, each cell `border-r border-border/40`
2. Word breakdown list: same markup as `SpeakingScores` in `ShadowingRevealPhase`
   - Each word: `flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2`
   - Progress bar `h-1.5 flex-1 rounded-full`, colored emerald/amber/red
   - Error type pill: `rounded-full border px-1.5 py-0.5 text-[9px]` — Mispron. (amber), Omission (red), Insertion (blue)
3. Result actions row: Try again (outline, flex-1) + Next → (primary, flex-1) — rendered at the bottom of Body
4. Footer: hidden once results are shown (the result actions row replaces it). The footer Skip remains visible only while waiting to submit (before scoring).

---

## ProgressBar

Update to be slightly more prominent:
- Track height: `h-1` (from `h-0.5`) — this is the only change; thicker track adds prominence
- Fill color: unchanged (`bg-foreground/60`)
- Counter: unchanged

---

## shadcn Components Used

| Component | Usage |
|-----------|-------|
| `Button` | All actions — `variant="ghost"`, `variant="outline"`, default (primary), `variant="destructive"` |
| `Input` | PinyinRecall, Dictation, Reconstruction text inputs |
| `Card` / divs | Outer shell (or plain divs with equivalent classes) |

Native `<input>` is acceptable **only** for the inline cloze blanks (must be `inline` within a text flow — shadcn `Input` is always block-level).

---

## Out of Scope

- `SessionSummary`, `ModePicker`, `StudySession` layout — unchanged
- `WordCard`, `LessonGroup` workbook components — separate task
- Animations / Framer Motion — can be added later; not part of this redesign
