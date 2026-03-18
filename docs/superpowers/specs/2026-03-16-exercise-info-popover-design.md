# Exercise Info Popover

**Date:** 2026-03-16

## Goal

Add a small, unobtrusive info popover to each exercise card so users can understand the purpose and mechanics of an exercise without cluttering the UI.

## Design

### ExerciseCard

Add an optional `info?: string` prop to `ExerciseCard`. If provided:

- Render a small `Info` icon button (from `lucide-react`) in the card header, placed between the type label and the progress text.
- The button opens a shadcn `Popover` (`@/components/ui/popover`). The `popover` shadcn component must be added first: `npx shadcn@latest add popover`.
- Popover content: the `type` string as a bold title, followed by the `info` description.
- If `info` is not provided, the header renders exactly as today (no icon, no popover).

### Exercise copy

Each exercise passes a single `info` string to `ExerciseCard`:

| Exercise | Info string |
|---|---|
| Dictation | Listen to the audio clip and type the Chinese sentence you hear. Tests listening comprehension and character recall. |
| Pinyin Recall | See the characters and type their pinyin with tone marks. Tests pronunciation knowledge without speaking aloud. |
| Sentence Reconstruction | Rearrange the scrambled word chips into the correct sentence. Tests grammar and word order. |
| Scenario Cloze | Read a short story and fill in the missing vocabulary words from context. Tests contextual understanding. |
| Pronunciation Referee | Read the sentence aloud and get AI-scored feedback on accuracy, fluency, and prosody. |
| Character Writing | Trace each stroke of the character in the correct order. Builds handwriting muscle memory. |

## Components affected

- `frontend/src/components/study/exercises/ExerciseCard.tsx` — add `info` prop + popover
- `frontend/src/components/study/exercises/DictationExercise.tsx`
- `frontend/src/components/study/exercises/PinyinRecallExercise.tsx`
- `frontend/src/components/study/exercises/ReconstructionExercise.tsx`
- `frontend/src/components/study/exercises/ClozeExercise.tsx`
- `frontend/src/components/study/exercises/PronunciationReferee.tsx`
- `frontend/src/components/study/exercises/CharacterWritingExercise.tsx`

## Out of scope

- Persistence (no "don't show again")
- Animations beyond shadcn defaults
- Changes to shadowing exercise components
