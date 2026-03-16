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
4. As a learner, I want to replay a segment as many times as I need before attempting it.
5. As a learner, I want feedback after each attempt — correct text revealed plus scoring — so I know how I did.
6. As a learner, I want to retry a segment or skip it, so I stay in control of the pace.
7. As a learner, I want a session summary at the end so I can see which segments need more practice.

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
| Session start | Always from segment 1 | Predictable, no ambiguity about where to begin |
| Segment audio source | PlayerContext (seek to segment.start, play, pause at segment.end) | Video audio already exists — no TTS needed |

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

### New Components

| Component | Responsibility |
|---|---|
| `ShadowingPanel` | Main container. Owns segment index, current phase state, orchestrates the 3-phase loop. |
| `ShadowingModePicker` | shadcn `Dialog`. Lets user pick Dictation or Speaking, then emits start event. |
| `ShadowingListenPhase` | Triggers `PlayerContext` seek+play, shows animated waveform, exposes Replay button. |
| `ShadowingDictationPhase` | Text input with 汉字/pinyin toggle, Replay button, Submit. |
| `ShadowingSpeakingPhase` | MediaRecorder-based recording UI, live waveform, Stop & Submit. |
| `ShadowingRevealPhase` | Reveals correct Chinese + pinyin + translation. Shows char diff (dictation) or Azure scores (speaking). Retry / Next / Exit actions. |

### Reused from existing code

- `PlayerContext` — seek, play, pause, currentTime
- Azure Speech scoring — same API call pattern as `PronunciationReferee`
- Char diff logic — same pattern as `DictationExercise`
- shadcn `Dialog` — for `ShadowingModePicker`

---

## UX Flow

### Entry Point

A small **"🎯 Shadow"** button is added to the `VideoPanel` controls bar (alongside speed buttons). Clicking it opens `ShadowingModePicker`.

### Mode Picker Dialog

- Two options: **✍️ Dictation** (listen, type) and **🎤 Speaking** (listen, speak back — scored by Azure)
- Speaking is greyed out with tooltip if Azure is not configured or MediaRecorder is unsupported
- Cancel returns to normal view; Start begins the session at segment 1

### Per-Segment State Machine

```
LISTEN → ATTEMPT → REVEAL → (retry → LISTEN) | (next → LISTEN[n+1]) | (exit)
```

After the last segment: REVEAL → SESSION SUMMARY → exit (TranscriptPanel restored).

#### Phase 1 — Listen
- Seek to `segment.start`, play video audio
- Show animated waveform (achromatic, matches app theme)
- Auto-transitions to Attempt when audio reaches `segment.end`
- Replay button replays the segment audio
- Skip link advances without attempting

#### Phase 2a — Dictation Attempt
- Blank text input (no Chinese visible)
- Toggle between 汉字 and pinyin input modes
- Replay button available
- Empty submit shakes the input — must enter something or use skip

#### Phase 2b — Speaking Attempt
- Large mic button starts/stops MediaRecorder
- Live waveform during recording (red, matches destructive colour)
- Replay button available before recording
- Stop & Submit sends audio to Azure

#### Phase 3 — Reveal
- Correct Chinese + pinyin + translation revealed for the first time
- **Dictation**: character-by-character diff (correct chars white, wrong chars red)
- **Speaking**: overall accuracy/fluency/prosody scores + per-word accuracy bars
- Actions: **↺ Retry** (back to Listen, same segment) · **Next →** · **✕ Exit**

### Session Summary
Shown after the last segment is completed or skipped:
- Total segments attempted
- Average score (speaking: average accuracy; dictation: average char accuracy)
- Weakest segments listed (lowest scores) for review
- "Done" button restores TranscriptPanel

---

## Visual Design

Follows the existing achromatic glass theme exactly:

- **Background**: `oklch(0.08 0 0)` deep black with radial gradients
- **Panel**: `glass-card` — `rgba(255,255,255,0.04)` with backdrop blur
- **Borders**: `rgba(255,255,255,0.08)` hairline, brightens to `rgba(255,255,255,0.18)` when active
- **Text**: `oklch(0.97 0 0)` primary, `oklch(0.52 0 0)` muted
- **Primary button**: white background, black text
- **Recording state**: destructive red `oklch(0.60 0.20 25)` — only colour in the UI
- **No purple, blue, green, or other accent colours**

Phase border colour: active panel has brightened border — no coloured phase indicators.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Segment has no audio (silent gap) | Skip automatically, advance to next segment |
| Azure not configured | Speaking mode greyed out in picker with tooltip |
| MediaRecorder not supported | Speaking mode greyed out in picker |
| Azure call fails mid-session | Show error in reveal, allow retry or skip — session continues |
| User exits mid-session | TranscriptPanel restored immediately, no summary |
| Dictation submitted empty | Shake animation on input, no submit |
| Lesson has 0 segments | Shadow button is disabled |

---

## Testing

- **Unit**: phase state machine transitions (listen → attempt → reveal → next/retry/exit)
- **Unit**: dictation char diff scoring
- **Unit**: segment skip logic, session summary score aggregation
- **Integration**: full session flow (enter mode → attempt 2 segments → session summary → exit)
- **Mocking**: Azure and MediaRecorder mocked — same pattern as existing `PronunciationReferee` tests
