# Skill Guide: Tones (Vietnamese Speakers)

> Vietnamese speakers have DIFFERENT tone difficulties than non-tonal L1 speakers. Do NOT use generic tone teaching.

**Research basis:** Liang et al. (2023, *Global Chinese*) — 30 Vietnamese learners, 80 disyllabic words.

## Tone Difficulty Ranking (Vietnamese Speakers)

| Rank | Tone | Problem | Why |
|---|---|---|---|
| 1 (hardest) | **T4 (falling 51)** | Frequently produced as T1 | Vietnamese sắc (rising-sharp) maps to T4 historically but contour is opposite |
| 2 | **T3 sandhi** | T3+T3 → T2+T3 rule not applied | Vietnamese has no equivalent sandhi rule — must be explicitly drilled |
| 3 | **T1 (high level 55)** | Produced as mid-level | Vietnamese ngang is mid-pitch (~33); Mandarin T1 is HIGH (~55). Learner must raise pitch. |
| 4 (easiest) | **T2 (rising 35)** | Closest to Vietnamese hỏi tone | Still needs fine-tuning of contour |

## Tone Teaching Protocol for Vietnamese Speakers

1. **Start with T1 vs T4 minimal pairs** (NOT T2 vs T3 like for English speakers):
   - 妈 mā (mom) vs 骂 mà (scold)
   - 书 shū (book) vs 树 shù (tree)
   - 飞 fēi (fly) vs 费 fèi (fee)

2. **T3 sandhi is a dedicated lesson**, not a footnote:
   - 你好 nǐhǎo → níhǎo — drill until automatic
   - 水果 shuǐguǒ → shuíguǒ
   - 你可以 nǐ kěyǐ → ní kěyǐ
   - Rule: T3 in non-final position is ALWAYS half-third (low level, no rise)

3. **Pitch contour visualization** is proven effective:
   - Praat-based feedback (Computer Assisted Language Learning, 2022) — Vietnamese beginners showed significantly larger gains with visual pitch feedback vs teacher-only feedback
   - Show T1 as flat HIGH line, T2 as rising, T3 as low-dip, T4 as sharp fall

4. **Tone sandhi rules to teach explicitly:**
   - T3+T3 → T2+T3 (你好)
   - 一 yī sandhi: before T4 → yí (一个); before T1/T2/T3 → yì (一天)
   - 不 bù before T4 → bú (不是 búshì)
   - Consecutive T1: second T1 slightly drops — don't over-correct this

5. **Drill tones in word context, not isolation.** After initial introduction, always use real vocabulary pairs. Isolated mā/má/mǎ/mà drills plateau quickly (Bilingualism: Language and Cognition, 2024).

6. **Use Hán Việt tone correspondences as memory anchors:**
   - "học" (sắc tone) → "学 xué" (T2) — sắc maps to T2 for this word
   - Teach the systematic pattern, not just individual words

## Exercise Mapping for Tones

- `render_pronunciation_exercise` — tone minimal pairs, sentence-level tone drills
- After shadowing — explicit feedback on which tones were incorrect, then brief targeted drill
