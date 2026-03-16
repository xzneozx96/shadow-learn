# Shadowing Mode — Design Spec

**Date:** 2026-03-16
**Status:** Approved

---

## Overview

Shadowing is a language learning technique where the learner listens to a native speaker and immediately reproduces what they heard — either by typing it (dictation) or speaking it back (oral repetition). The app currently has a lesson view with video playback and a transcript panel, but no mechanism to practice shadowing inline.

This spec defines a **Shadowing Mode** that replaces the transcript panel in the lesson view with a focused exercise workspace, letting users shadow each segment of a lesson one by one.

---

## User Stories

1. As a learner, I want to enter shadowing mode from the lesson view so I can practice without leaving the lesson context.
2. As a learner, I want to choose between dictation (typing) and speaking (recording) before starting, so I can focus on one skill at a time.
3. As a learner, I want to hear each segment before attempting it, so I'm training my ear — not reading the answer.
4. As a learner, I want to replay a segment audio as many times as I need before committing to my attempt.
5. As a learner, I want feedback after each attempt — correct text revealed plus scoring — so I know how I did.
6. As a learner, I want to retry a segment or skip it, so I stay in control of the pace.
7. As a learner, I want a session summary at the end so I can see which segments need more practice.
8. As a learner, I want keyboard shortcuts (Enter to submit, Space to replay) so I can practice without reaching for the mouse.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Where does shadowing mode live? | Inline in lesson view (state-driven panel swap) | Avoids navigation, keeps video and companion panel intact |
| Mode selection | Pick one upfront: Dictation or Speaking | Mixing modes per segment creates cognitive overhead and breaks flow |
| Movement through segments | Hybrid: auto-pause after each segment + manual retry/skip | Preserves natural shadowing rhythm while keeping user in control |
| Answer visibility during attempt | Hidden — revealed only after submission | Showing the answer defeats the purpose of ear training |
| Oral feedback | Azure Speech scoring (accuracy, fluency, prosody, per-word) | Consistent with existing PronunciationReferee; graceful degradation if unconfigured |
| Dictation feedback | Character-by-character diff (green = correct, red = wrong) | Simple, effective, no external dependency |
| Session start | Always from the **first segment of the lesson** (index 0), regardless of current video position. The video is silently seeked to segment 0 start — no warning or prompt. | Predictable, no ambiguity about where to begin. User explicitly chose to enter shadowing mode. |
| Segment audio source | PlayerContext (seek to segment.start, play, pause at segment.end) | Video audio already exists — no TTS needed |
| Waveforms | Decorative CSS animation only — not a real-time audio analyser | Correct visual affordance with negligible implementation cost; real AnalyserNode is out of scope |
| Pinyin dictation input | Free-text romanisation; stored pinyin uses diacritic tone marks (ā á ǎ à); user input and stored pinyin both have diacritics stripped before comparison | Tone marks are hard to type; tone-less pinyin is a valid and common input method |
| Char diff algorithm | Positional diff over Unicode grapheme clusters (not code units) | Correct handling of multi-codepoint CJK characters and combining marks |

---

## Architecture

### Approach: State-driven panel swap (LessonView)

`LessonView` gains a `shadowingMode` state:

```ts
type ShadowingMode = null | { mode: 'dictation' | 'speaking' }
```

- `null` → renders `<TranscriptPanel>` (current behaviour, unchanged)
- `{ mode }` → renders `<ShadowingPanel mode={mode} onExit={() => setShadowingMode(null)} />`

`VideoPanel` and `CompanionPanel` are completely unaware of shadowing mode — they remain mounted and functional throughout.

### Entry Point Wiring

`VideoPanel` receives an `onShadowingClick: () => void` prop from `LessonView`. Clicking the Shadow button calls this prop. `LessonView` owns a `pickerOpen: boolean` state — `onShadowingClick` sets it to `true`, which renders `ShadowingModePicker` (a Dialog). On Start, `LessonView` sets `shadowingMode` and `pickerOpen = false`. On Cancel, only `pickerOpen = false`.

### New Components

| Component | Responsibility |
|---|---|
| `ShadowingPanel` | Main container. Owns segment index and current phase state. Orchestrates the 3-phase loop. |
| `ShadowingModePicker` | shadcn `Dialog`. Lets user pick Dictation or Speaking, then calls `onStart(mode)`. |
| `ShadowingListenPhase` | Triggers PlayerContext seek+play for the current segment. Shows decorative waveform animation. Exposes Replay button. |
| `ShadowingDictationPhase` | Text input with 汉字/pinyin toggle, Replay button, Submit. |
| `ShadowingSpeakingPhase` | MediaRecorder-based recording UI, decorative waveform animation during recording, sub-states for initial/recording/recorded. |
| `ShadowingRevealPhase` | Reveals correct Chinese + pinyin + translation. Shows char diff (dictation) or Azure scores + loading state (speaking). Retry / Next / Exit actions. |
| `ShadowingSessionSummary` | Post-session view: stats, weakest segments list, Done button. |

### Reused from existing code

- `PlayerContext` — seek, play, pause, currentTime
- Azure Speech scoring — same API call pattern as `PronunciationReferee`
- Char diff logic — same pattern as `DictationExercise`
- shadcn `Dialog` — for `ShadowingModePicker` and exit confirmation

---

## UX Flow

### Entry Point

A small **"🎯 Shadow"** button is added to the `VideoPanel` controls bar (alongside speed buttons). It is **disabled** if the lesson has 0 segments. Clicking it fires `onShadowingClick` → `LessonView` opens `ShadowingModePicker`.

### Mode Picker Dialog

- Two options: **✍️ Dictation** (listen, type) and **🎤 Speaking** (listen, speak back — scored by Azure)
- Speaking option is **disabled** (greyed out, tooltip: "Azure key required in Settings") if Azure is not configured or `MediaRecorder` is not supported in the browser
- Cancel closes the dialog, returns to normal view
- Start calls `onStart(mode)` → `LessonView` sets `shadowingMode`, `ShadowingPanel` mounts at segment index 0

### Per-Segment State Machine

**Exit** is available in **all phases** (Listen, Attempt, Reveal) via the ✕ exit button. Exit behaviour is consistent across phases — see the Exit section below.

```
LISTEN ──[skip]──→ LISTEN (segment + 1)
LISTEN ──[exit]──→ [exit flow]
LISTEN ──[auto: currentTime >= segment.end or ended event]──→ ATTEMPT ──[skip]──→ LISTEN (segment + 1)
                                                                        ──[exit]──→ [exit flow]
                                                                        ──[submit]──→ REVEAL ──[retry]──→ LISTEN (same segment)
                                                                                             ──[next]───→ LISTEN (segment + 1)
                                                                                             ──[exit]───→ [exit flow]
```

After the last segment's REVEAL → next → SESSION SUMMARY → Done (TranscriptPanel restored).

**Auto-skipped segments** (duration < 0.5s): `ShadowingPanel` detects these before mounting a phase and silently advances `segmentIndex`. The progress bar jumps during this silent advance — this is acceptable and expected.

**Skip** (user-initiated): advances directly to the next segment's LISTEN phase without REVEAL. Segment marked as skipped in session stats.

**Exit flow**: if ≥ 3 segments have been attempted (per-segment deduplicated count, same definition as session summary "Attempted"), show a confirmation dialog ("Exit shadowing mode? Your progress will be lost.") before restoring TranscriptPanel. If < 3 attempted, exit silently. Rationale for threshold: 3 represents meaningful investment; below that, accidental exits don't need friction.

**Session data is ephemeral**: no session results, scores, or stats are persisted to IndexedDB or any other store. Closing the app, navigating away, or exiting mid-session discards all data. Persistence is out of scope for this feature.

#### Phase 1 — Listen

- `ShadowingPanel` seeks the video to `segment.start` and calls play
- Also listens to the `ended` event on the media element (for the last segment of a video) as a fallback trigger alongside `currentTime >= segment.end`
- Decorative animated waveform bars shown (CSS keyframe animation, not real audio data)
- **Auto-transition mechanism**: `ShadowingListenPhase` maintains a `hasAutoTransitioned` ref that is **component-local** (lives in `ShadowingListenPhase`, not in `ShadowingPanel`). It initialises to `false` on mount. On `currentTime >= segment.end` or `ended` event, if `hasAutoTransitioned` is `false`: set it `true` and call the `onAutoTransition` prop. Subsequent events are ignored. Because the ref is component-local, it resets automatically whenever the component unmounts and remounts (e.g., on Retry or moving to the next segment) — no explicit reset by `ShadowingPanel` is needed.
- **On Retry** (from REVEAL): `ShadowingPanel` sets phase back to `'listen'` for the same segment index, causing `ShadowingListenPhase` to unmount and remount, which naturally resets `hasAutoTransitioned` to `false`. The segment plays from the start again.
- **`ended` event access**: `PlayerContext` must expose an `onEnded` callback registration (or the raw media element ref) so `ShadowingListenPhase` can subscribe. If `PlayerContext` does not already expose this, it should be extended with an `onEnded?: () => void` prop or a `mediaRef` — this is the one required PlayerContext change for this feature.
- **Replay button**: seeks back to `segment.start` and plays again. Does not reset `hasAutoTransitioned`. Available unlimited times.
- Keyboard: `Space` replays; calls `event.preventDefault()` to suppress browser scroll. Only fires when focus is not inside a text input.

#### Phase 2a — Dictation Attempt

- Text input is blank, focused on mount. No Chinese text visible anywhere in the panel
- Toggle between **汉字** mode (user types Chinese characters) and **pinyin** mode (user types romanised pinyin without tone marks, e.g. "ni zai xue shenme")
- **Replay button** available at all times in this phase. Replay is fire-and-forget: segment audio plays while the user continues typing — the input is not blocked. This mirrors natural shadowing (listen and reproduce simultaneously).
- **Submit**: if input is empty, input shakes (CSS shake animation) and does not submit. Otherwise transitions to REVEAL
- Keyboard: `Enter` submits; `Space` replays only when focus is not inside the text input (does not call `preventDefault` when focus is in the input, allowing normal space character entry)

#### Phase 2b — Speaking Attempt

Three internal sub-states:

1. **initial** — mic button visible, Replay available
2. **recording** — MediaRecorder active, decorative red waveform shown, Replay hidden (rationale: mic would capture the segment audio), Stop button shown
3. **recorded** — MediaRecorder stopped, audio blob ready. Re-record button + Submit button shown. Replay is NOT re-shown (to keep the user focused on submitting).

Sub-state transitions:
- initial → recording: tap mic button
- recording → recorded: tap Stop. Note: `MediaRecorder.stop()` is async. A brief "processing..." indicator is shown between Stop tap and the `onstop` callback firing (typically < 200ms). The recorded sub-state renders only after the blob is available.
- recorded → initial (re-record): tap Re-record, blob discarded. State fully resets to `initial` — mic button visible, Replay button visible again.
- recorded → REVEAL: tap Submit, blob sent to Azure
- any sub-state → next segment: tap Skip (stops active recording if any, blob discarded)

**Minimum recording duration**: if the user taps Stop within 0.5s of starting, the blob is discarded and the state resets to initial with a brief message "Recording too short — try again."

**Tab hidden / app backgrounded during recording**: if the `visibilitychange` event fires with `document.hidden === true` while recording, treat as a recording error: stop MediaRecorder, discard blob, show error message "Recording interrupted", reset to initial sub-state.

- Keyboard: `Space` starts/stops recording (calls `event.preventDefault()`); `Enter` submits if in recorded sub-state

#### Phase 3 — Reveal (Dictation)

- Correct Chinese characters + pinyin + English translation revealed
- Char diff: split both user input and correct text into **Unicode grapheme clusters** (use `Intl.Segmenter` with `granularity: 'grapheme'`). Positional diff: index 0 vs 0, etc. If lengths differ, the shorter is padded with empty slots (counted as incorrect). Each cluster: white if correct, red if wrong or missing.
- **Pinyin mode**: user input split on whitespace into syllables. Correct pinyin split on whitespace and diacritic tone marks stripped from both sides before comparison. Positional diff applied syllable-by-syllable with same padding rule.
- **Tone stripping**: remove Unicode diacritic characters in the range used by pinyin (ā á ǎ à ē é ě è ī í ǐ ì ō ó ǒ ò ū ú ǔ ù ǖ ǘ ǚ ǜ) by normalising to NFD then removing combining marks (Unicode category Mn).
- Overall accuracy score: `correct_units / total_units * 100` (integer, 0–100)
- Actions: **↺ Retry** · **Next →** · **✕ Exit**
- Keyboard shortcuts apply only when focus is within the `ShadowingPanel` region or its descendants (not when focus is in CompanionPanel or VideoPanel). `Enter` advances; `r` retries.

#### Phase 3 — Reveal (Speaking)

- Shows a loading spinner while Azure call is in flight
- **Timeout**: if Azure has not responded within **10 seconds**, cancel the request and treat as failure
- On success: correct Chinese + pinyin + translation revealed, overall scores (accuracy / fluency / prosody), per-word accuracy bars
- On failure or timeout: error message ("Scoring unavailable"), correct text still revealed, Retry and Next available. Score recorded as `null`, excluded from session average.
- Actions: **↺ Retry** · **Next →** · **✕ Exit**
- Keyboard shortcuts apply only when focus is within `ShadowingPanel`. `Enter` advances; `r` retries.

### Session Summary

Shown after the last segment is completed (not when the user exits early).

- **Total segments**: `lesson.segments.length` (includes auto-skipped)
- **Attempted**: segments where user submitted an answer (excludes user-skipped and auto-skipped). Retrying a segment does not increase the attempted count — it is per-segment, deduplicated.
- **Skipped**: segments the user explicitly skipped
- Note: `Total != Attempted + Skipped` for lessons with auto-skipped segments. This gap is intentional — auto-skipped segments are not surfaced in the summary UI. The numbers will not add up to Total, and that is by design.
- **Average score**: mean of non-null scores across attempted segments. If no valid scores exist, display `—`.
- **Weakest segments**: up to 3 attempted segments with the lowest non-null scores. Tiebreaker: earlier segment index wins (first in lesson). Section omitted entirely if no valid scores.
- **Done** button restores TranscriptPanel

---

## Visual Design

Follows the existing achromatic glass theme exactly:

- **Background**: `oklch(0.08 0 0)` deep black with radial gradients
- **Panel**: `glass-card` — `rgba(255,255,255,0.04)` with backdrop blur
- **Borders**: `rgba(255,255,255,0.08)` hairline; active phase panel brightens to `rgba(255,255,255,0.18)`
- **Text**: `oklch(0.97 0 0)` primary, `oklch(0.52 0 0)` muted
- **Primary button**: white background, black text
- **Recording state**: destructive red `oklch(0.60 0.20 25)` — the only colour used in the UI
- **No purple, blue, green, or other accent colours**
- Progress bar at top of panel: `(segmentIndex + 1) / lesson.segments.length`. Jumps silently during auto-skips.

---

## Accessibility

- On shadowing mode entry, focus moves to the ShadowingPanel container (`tabIndex=0`, `role="region"`, `aria-label="Shadowing mode"`)
- On phase transition, focus moves to the primary action of the new phase (Replay in Listen, input/mic in Attempt, Next in Reveal)
- Mic button: `aria-label="Start recording"` or `"Stop recording"` per sub-state
- Skip: `aria-label="Skip this segment"`
- Exit: `aria-label="Exit shadowing mode"`
- All keyboard shortcuts call `event.preventDefault()` where needed to suppress browser defaults (Space scroll, Enter form submit)

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Segment duration < 0.5s (effectively silent) | Auto-skipped silently; not counted in attempted or skipped stats; progress bar jumps |
| Azure not configured | Speaking mode disabled in picker (greyed out, tooltip) |
| MediaRecorder not supported | Speaking mode disabled in picker (greyed out, tooltip) |
| Azure call fails or times out (10s) | Scores show as unavailable in reveal; correct text still shown; session continues; segment score = null |
| User exits mid-session with ≥ 3 attempts | Confirmation dialog shown before restoring TranscriptPanel |
| User exits mid-session with < 3 attempts | Silent exit, TranscriptPanel restored immediately |
| Dictation submitted empty | Input shake animation; no transition |
| Lesson has 0 segments | Shadow button disabled |
| All segments skipped | Session summary: 0 attempted, average = "—", weakest segments section omitted |
| Single segment lesson | Session summary shown after that segment's reveal |
| Recording too short (< 0.5s) | Blob discarded, reset to initial sub-state, brief "Recording too short" message |
| Tab hidden during recording | Recording stopped and discarded, error message shown, reset to initial sub-state |
| Video `ended` event fires before `currentTime >= segment.end` | Both events trigger auto-transition; `hasAutoTransitioned` ref prevents double-firing |

---

## Testing

- **Unit**: phase state machine — all transitions (listen→attempt, attempt→reveal, reveal→next, reveal→retry, skip from listen, skip from attempt, exit from all phases)
- **Unit**: `hasAutoTransitioned` ref — does not reset on replay, resets on Retry re-mount
- **Unit**: dictation char diff — hanzi mode (grapheme cluster split, positional diff, padding), pinyin mode (whitespace split, tone stripping via NFD+Mn removal, positional diff)
- **Unit**: session summary — average excluding skips and null scores, weakest segment selection with tiebreaker
- **Unit**: auto-skip logic for silent segments (duration < 0.5s)
- **Unit**: minimum recording duration guard (< 0.5s → discard + reset)
- **Integration**: full dictation session (enter → attempt 2 segments → session summary → exit)
- **Integration**: full speaking session with mocked Azure (enter → record → submit → reveal scores → next)
- **Integration**: exit confirmation shown when ≥ 3 segments attempted; suppressed when < 3
- **Integration**: tab-hidden recording interruption (mock `visibilitychange` event)
- **Mocking**: Azure Speech API and MediaRecorder mocked — same pattern as existing `PronunciationReferee` tests. The existing `PronunciationReferee` already sends WebM blobs to Azure (the browser MediaRecorder default); the same blob format and API call are reused here. No audio transcoding required.
- **Accessibility**: focus management on phase transitions via testing-library `getByRole` assertions
