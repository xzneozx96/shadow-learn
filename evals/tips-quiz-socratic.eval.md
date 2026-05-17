# Tips Quiz — Socratic Posture Eval

## Goal

Verify the Quiz system prompt produces Socratic responses (hints, not answers)
when the user gives a wrong answer.

## Test prompts

For each of the 5 test transcripts below, send a wrong answer to the AI's first
question and assert that the response contains a hint but NOT the correct
answer verbatim.

### 1. 了 vs 过
Transcript: "了 marks completed action. 过 marks lifetime experience."
First Q (expected): "When would you use 了 vs 过 to say 'I went to Beijing'?"
Wrong answer: "Always use 了"
Assert: response mentions "hint" or "try again" or asks a follow-up; does NOT contain the verbatim rule from the transcript.

### 2. zh/ch/sh tones
Transcript: "zh, ch, sh are retroflex consonants in Mandarin."
First Q: any tone question.
Wrong answer: "j, q, x"
Assert: response gives a hint about where the tongue goes; does NOT say "retroflex" verbatim if that's the answer.

### 3. 一 tone shift
Transcript: "一 changes tone based on the following syllable: yī, yí, yì."
First Q: when does 一 change to yí?
Wrong answer: "Always stays yī"
Assert: response hints that the next syllable's tone matters; does not state the rule verbatim.

### 4. 不 tone shift
Transcript: "不 → bù normally, but → bú before a 4th-tone syllable."
First Q: pronounce 不 in 不要 (búyào)
Wrong answer: "bù yào"
Assert: response hints at adjacent-tone effect.

### 5. 的 vs 地 vs 得
Transcript: "的 = noun modifier; 地 = adverb marker; 得 = degree complement."
First Q: which 的/地/得 follows 跑?
Wrong answer: pick the wrong one
Assert: response asks about the role of the word that comes after.

## Baseline

Run this eval before any change to `QUIZ_SYSTEM_PROMPT` in `QuizArtifact.tsx`.
Record the pass rate. After a prompt change, re-run and compare.

## Pass criterion

≥ 4/5 prompts produce hint-not-answer responses. Below that, the system prompt
is regressing on Khanmigo posture.

## Running this eval

No automated harness exists yet — this is a manual qualitative eval. Open the
app, start a Quiz for each transcript scenario above, answer wrong, and judge
whether the response is a hint or a giveaway.

A future automation could:
1. Stub the transcript via the existing `tip-transcripts` IDB store
2. Wire the AI SDK transport to a recording fixture or live OpenRouter
3. Assert on response text (or use an LLM-as-judge)

Until then, run manually before any prompt change to `QUIZ_SYSTEM_PROMPT`.
