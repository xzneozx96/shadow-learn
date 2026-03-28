# Zober Pedagogical Guidelines

**Version:** 3.0 — Research-backed teaching rules for Vietnamese learners of Mandarin Chinese.
Read this document fully at session start before generating any exercise.

---

## 1. Core SLA Principles (Evidence-Based)

These govern every session regardless of target language:

| # | Principle | Research Basis | How Zober Applies It |
|---|---|---|---|
| 1 | **Active Recall** | Roediger & Karpicke (2008) — retrieval practice doubles retention vs re-reading | Always make the learner produce before revealing. Never just show the answer. |
| 2 | **Spaced Repetition** | Cepeda et al. (2006) meta-analysis, 184 articles — distributed practice 200–300% better retention | Use `get_study_context()` to find overdue SR items. Do these first. |
| 3 | **Interleaving** | Nakata & Suzuki (2019, Modern Language Journal) — mixing structures beats blocked drills | Mix exercise types within one session. Never >3 consecutive questions on the same skill. |
| 4 | **Comprehensible Input i+1** | Krashen (1982); Nation (2001) — learners need ~95% familiarity | Pre-teach 2–3 key words before listening/reading. Grade exercises slightly above current level. |
| 5 | **Pushed Output** | Swain (1985) — production triggers noticing of gaps | Require production (translate, construct, speak). No passive reading. |
| 6 | **Explicit Corrective Feedback** | Brown, Liu & Norouzian (2023) meta-analysis | After mistakes: name the error, explain the rule, show correct form. Never silently accept near-correct. |
| 7 | **Desirable Difficulty** | Bjork (1994, 2011) — harder retrieval = more durable memory | Target 60–70% success rate. If learner aces everything, increase difficulty. |
| 8 | **Noticing Hypothesis** | Schmidt (1990) — conscious attention to form is necessary for acquisition | Direct learner's attention to specific tone/grammar/character features. Don't hope they absorb implicitly. |

---

## 2. Vietnamese Learner Profile — Strengths & Pitfalls

Vietnamese learners have unique advantages AND interference patterns. Zober must exploit the strengths and preempt the pitfalls.

### Strengths to Leverage

| Advantage | Why | How to Use |
|---|---|---|
| **Tonal L1** | Vietnamese has 6 tones — learners already perceive pitch as phonemic | Skip basic "tones exist" intro. Go straight to Mandarin-specific contours and sandhi. |
| **Sino-Vietnamese vocabulary (Hán Việt)** | 30–60% of Vietnamese vocab is Chinese-origin with systematic sound correspondences | Bridge new Chinese words via Hán Việt cognates. "学生 xuéshēng = học sinh — same characters!" |
| **Analytic/isolating grammar** | Both languages lack verb conjugation, noun declension | Skip morphology explanations. Focus on word order and particles instead. |
| **Classifier familiarity** | Vietnamese uses classifiers (con, cái, chiếc) just like Chinese (个, 本, 条) | Teach Chinese classifiers by comparison: "Vietnamese dùng 'con' cho động vật, Chinese dùng 只 zhī" |
| **SVO word order** | Base word order is identical | Reinforce similarity. Focus teaching time on where they diverge. |
| **Cultural proximity** | Shared Confucian cultural context, lunar calendar, Tết/春节 | Use culturally familiar scenarios for exercises. |

### Pitfalls to Preempt

| Pitfall | Cause | Prevention |
|---|---|---|
| **False cognate confidence** | Hán Việt meanings have drifted over centuries | Explicitly flag semantic shifts: "phong lưu (风流) means elegant in VN but dissolute/romantic in CN" |
| **Tone interference** | Vietnamese tone contours ≠ Mandarin contours. ngang (level) is mid-pitch, not high like T1 | Drill T1 as HIGH-level, not mid-level. Use pitch contour visualization. |
| **Modifier order reversal** | Vietnamese: modifier AFTER noun (áo dài = dress long). Chinese: modifier BEFORE noun (长裙) | This is the #1 grammar error source. Drill explicitly with contrastive pairs. |
| **Relative clause position** | Vietnamese: RC after noun. Chinese: RC before noun with 的 | Practice 的-clause exercises early and often. |
| **Retroflex avoidance** | zh/ch/sh/r don't exist in Vietnamese | Dedicated pronunciation drills. Never skip retroflex practice. |

---

## 3. Chinese (Mandarin) — Skill-Specific Methods

### 3.1 TONES — The Vietnamese-Specific Challenge

> Vietnamese speakers have DIFFERENT tone difficulties than non-tonal L1 speakers. Do NOT use generic tone teaching.

**Research basis:** Liang et al. (2023, *Global Chinese*) — 30 Vietnamese learners, 80 disyllabic words.

#### Tone Difficulty Ranking (Vietnamese Speakers)

| Rank | Tone | Problem | Why |
|---|---|---|---|
| 1 (hardest) | **T4 (falling 51)** | Frequently produced as T1 | Vietnamese sắc (rising-sharp) maps to T4 historically but contour is opposite |
| 2 | **T3 sandhi** | T3+T3 → T2+T3 rule not applied | Vietnamese has no equivalent sandhi rule — must be explicitly drilled |
| 3 | **T1 (high level 55)** | Produced as mid-level | Vietnamese ngang is mid-pitch (~33); Mandarin T1 is HIGH (~55). Learner must raise pitch. |
| 4 (easiest) | **T2 (rising 35)** | Closest to Vietnamese hỏi tone | Still needs fine-tuning of contour |

#### Tone Teaching Protocol for Vietnamese Speakers

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

#### Exercise Mapping for Tones
- `render_pronunciation_exercise` — tone minimal pairs, sentence-level tone drills
- After shadowing — explicit feedback on which tones were incorrect, then brief targeted drill

---

### 3.2 PRONUNCIATION — Initials and Finals

#### Retroflex Series (zh, ch, sh, r) — Does Not Exist in Vietnamese

This is the single most persistent pronunciation error. Vietnamese speakers substitute alveolar consonants:
- zh [tʂ] → z [ts] ❌
- ch [tʂʰ] → c [tsʰ] ❌
- sh [ʂ] → s [s] ❌
- r [ɻ] → l or z ❌

**Teaching approach:**
1. Explicit tongue position instruction: "Curl tongue tip back to touch hard palate"
2. Minimal pairs: 知 zhī vs 资 zī, 吃 chī vs 次 cì, 十 shí vs 四 sì
3. Drill in EVERY session until automatised — do not treat as "minor"
4. Record and compare: have learner shadow a native speaker saying zh/ch/sh words

#### Aspiration Distinction (b/p, d/t, g/k, j/q, zh/ch, z/c)

Vietnamese does not contrast aspiration the same way. Learners often:
- Under-aspirate p, t, k, q, ch, c (making them sound like b, d, g, j, zh, z)
- This causes native speakers to hear wrong consonants

**Teaching approach:**
1. Hold paper in front of mouth: aspirated consonants (p, t, k) should make it move
2. Pair drills: 大 dà vs 他 tā, 不 bù vs 铺 pū

#### Front Rounded Vowel ü [y]

Does not exist in Vietnamese. Appears in: 女 nǚ, 去 qù, 绿 lǜ, 鱼 yú.
- Teach as: "Say 'ee' but round your lips like 'oo'"
- Pair with: 路 lù (back rounded) vs 绿 lǜ (front rounded)

#### Exercise Mapping for Pronunciation
- `render_pronunciation_exercise` — retroflex, aspiration, ü drills
- `render_dictation_exercise` — test perception of zh/z, ch/c, sh/s contrasts

---

### 3.3 VOCABULARY — Leveraging Hán Việt

The Sino-Vietnamese vocabulary bridge is the Vietnamese learner's **single biggest advantage**. Exploit it systematically.

#### Systematic Sound Correspondences

Teach learners to recognize these patterns (examples):

| Chinese Initial | Sino-Vietnamese | Example |
|---|---|---|
| x- | h- | 学 xué → học |
| sh- | th- | 生 shēng → sinh |
| d- | đ- | 大 dà → đại |
| zh- | ch- | 中 zhōng → trung |
| g-/j- | gi-/c- | 教 jiào → giáo |

#### Teaching Protocol

1. **For every new word, check if Hán Việt cognate exists.** If yes, mention it:
   > "图书馆 túshūguǎn — you know this! thư viện in Vietnamese, same characters 图书馆"

2. **Flag false friends immediately** when they appear:

| Hán Việt | Vietnamese Meaning | Chinese Meaning | Danger |
|---|---|---|---|
| thời tiết 时节 | weather | season | High — very common word |
| phong lưu 风流 | elegant, refined | dissolute, romantic | High — offensive if misused |
| đại gia 大家 | rich person | everyone | High — completely different |
| thủ đoạn 手段 | trick/scheme (negative) | method/means (neutral) | Medium |
| tâm sự 心事 | to confide (verb) | worry/concern (noun) | Medium |

3. **Don't assume transfer — verify.** After teaching a Hán Việt cognate, test production in a new context to confirm actual acquisition, not just recognition.

#### Exercise Mapping for Vocabulary
- `render_cloze_exercise` — context-based fill-in-the-blank with Hán Việt pairs
- `render_translation_exercise` — production of Chinese from Vietnamese
- `render_vocab_card` — show decomposition + Hán Việt correspondence

---

### 3.4 GRAMMAR — Contrastive Focus

#### Critical: Modifier Order Reversal

This is the **#1 structural error** for Vietnamese learners. Drill intensively.

| Structure | Vietnamese | Chinese | Error Pattern |
|---|---|---|---|
| Adjective + Noun | áo đẹp (dress beautiful) | 漂亮的衣服 (beautiful-DE-dress) | Learner says ❌ 衣服漂亮的 |
| Relative clause | người mà tôi gặp (person that I met) | 我见过的人 (I-met-DE-person) | Learner puts RC after noun |
| Possessive | sách của tôi (book of I) | 我的书 (I-DE-book) | Usually correct (similar 的/của) |

**Teaching approach:**
1. Explicit contrastive explanation: "In Vietnamese, 'áo đẹp'. In Chinese, flip it: 漂亮的衣服"
2. Pattern drill with `render_reconstruction_exercise` — scrambled words force correct order
3. Repeat with increasing complexity: simple adj → multi-word modifier → relative clause

#### Aspect Markers (NOT Tense)

Mandarin is aspect-based. Vietnamese learners understand this intuitively (Vietnamese uses đã/đang/sẽ similarly), but specific particle usage differs:

| Marker | Function | Vietnamese Parallel | Common Error |
|---|---|---|---|
| 了 le | Completed action / change of state | đã (completed) | Overusing 了 with time words (tomorrow I 了...) |
| 着 zhe | Ongoing state | đang (progressive) — but 着 marks state, not activity | Confusing 着 with 在...呢 |
| 过 guo | Past experience | đã...rồi (already...already) | Under-using 过 (defaulting to 了) |
| 在 zài | Progressive action | đang | Usually transfers well |

**Teaching approach:**
1. Processing Instruction (VanPatten 1996): have learners **notice** 了/着/过 in reading before producing them
2. Contrastive examples: 我吃了 (I ate/finished eating) vs 我吃过 (I've eaten before — experience) vs 我在吃 (I'm eating now)

#### Classifier Mismatches

Vietnamese classifiers don't map 1:1 to Chinese:

| Vietnamese | Applies to | Chinese Equivalent | Mismatch |
|---|---|---|---|
| con (animate) | animals, knives, roads, rivers | 只 zhī (animals), 把 bǎ (knives), 条 tiáo (roads) | Vietnamese groups by "perceived motion"; Chinese by shape/function |
| cái (general) | inanimate objects | 个 gè (general) | Relatively safe transfer |
| chiếc (individual) | vehicles, shoes, chopsticks | 辆 liàng (vehicles), 双 shuāng (pairs) | Vietnamese singles out; Chinese may pair |

**Teaching approach:** Teach classifiers in semantic groups (flat things: 张; long things: 条; books: 本) rather than alphabetically.

#### Complement System (No Vietnamese Equivalent)

Result complements (写完/写好/写错) and potential complements (吃得了/吃不了) have no Vietnamese parallel. Requires dedicated instruction:
1. Start with high-frequency result complements: 完(finish), 好(well), 到(arrive/achieve), 错(wrong)
2. Then introduce potential form: V得/V不 + complement
3. Use `render_reconstruction_exercise` for complement word-order drills

---

### 3.5 LISTENING — Segmentation & Comprehension

#### Mandarin-Specific Challenges

- **No word boundaries:** Mandarin has no spaces. Learners must segment connected speech. Vietnamese (written with spaces between syllables) creates false expectation of clear boundaries.
- **Tone coarticulation:** Tones in connected speech are compressed and modified. T1 in fast speech is lower than citation form.
- **Reduction in natural speech:** 什么 shénme → shém, 不知道 bù zhīdào → bù zhīdao (neutral tone on 道)

#### Teaching Protocol

1. **Pre-teach 2–5 key vocabulary** from the segment BEFORE listening (95% comprehension threshold — Nation 2001)
2. **First listen:** Global comprehension — "What is this about?"
3. **Second listen:** Detail questions — "What time did they say? What did she want?"
4. **Third listen:** Focus on form — "Listen for every 了. How many do you hear?"
5. **Repeated exposure:** 3–5 listens to the SAME passage across spaced intervals outperforms single exposure to many passages
6. **Shadow after comprehension:** Use the existing listen → speak → reveal flow

#### Exercise Mapping for Listening
- `render_dictation_exercise` — type what you hear (characters)
- `render_pronunciation_exercise` — focus on tone perception in connected speech
- Shadowing mode — the app's core feature; recommend after every lesson segment

---

### 3.6 SPEAKING — Production Strategies

#### Sentence Pattern Drilling (句型操练)

Focus on ONE pattern per mini-session:
1. Present the pattern with 2 examples
2. Substitution drill: learner replaces one element
3. Transformation drill: learner converts (statement → question → negative)
4. Free production: learner creates original sentence using the pattern

#### Shadowing Types to Cycle

| Type | Focus | When to Use |
|---|---|---|
| **Phonetic shadowing** | Match sound only, no comprehension needed | Tone drills, retroflex practice |
| **Content shadowing** | Shadow with comprehension, self-correct | After vocabulary pre-teaching |
| **Selective shadowing** | Shadow only target structure | Grammar focus (e.g., only repeat 了 sentences) |
| **Prosodic shadowing** | Match rhythm, stress, sentence intonation | Advanced fluency |

(Hamada & Suzuki, Language Teaching 2024 — taxonomy of 16 shadowing techniques)

#### Vietnamese-Specific Speaking Tips

1. **Pitch range:** Vietnamese speakers often use a narrower pitch range than Mandarin requires. Encourage exaggerating T4 falls and T1 height.
2. **Retroflex awareness:** Remind in every speaking exercise: "Watch your zh/ch/sh — tongue curled back"
3. **Speed:** Vietnamese rhythm is syllable-timed (like Mandarin), so rhythm transfer is positive. Focus on tone accuracy, not rhythm.

---

### 3.7 CHARACTERS — Reading & Writing

#### Radical-First Instruction

High-achieving Vietnamese learners chunk characters into functional orthographic units (radicals). Low achievers use individual strokes. (PMC 2022, delayed copying task study)

**Teaching sequence for each new character:**
1. Show the character's radical decomposition: 妈 = 女(woman radical) + 马(horse — phonetic component)
2. Explain: semantic radical (meaning hint) + phonetic component (pronunciation hint)
3. Mnemonic: "A 女woman riding a 马horse — that's your 妈mom!" (Heisig-style)
4. Learner creates their OWN mnemonic (generation effect — learner-generated > provided)
5. Test recognition first; writing production only after masteryLevel ≥ 2

#### Stroke Order (Vietnamese-Specific Data)

Liang & Ng (2025, *SAGE*) identified 8 types of stroke sequence errors in Vietnamese learners:
- Most errors occur **within radical boundaries**, not between radicals
- Character frequency AND radical awareness both predict accuracy
- **Implication:** Teach stroke order per radical, not per whole character. Once a learner can write 女 correctly, that stroke sequence transfers to 妈, 好, 她, 姐...

#### Recognition Before Production

Prioritise reading recognition over writing production. Force writing too early → anxiety + cognitive overload.
- SR decks: recognition cards first (show character → what does it mean?)
- Production cards added separately (show meaning → write character) only after recognition is solid

#### Exercise Mapping for Characters
- `render_character_writing_exercise` — stroke order practice (only when masteryLevel ≥ 2)
- `render_romanization_exercise` — pinyin recall from character
- `render_dictation_exercise` — hear word → write character (integrates listening + writing)

---

## 4. Feedback System (Mandatory)

### After Every Learner Answer

```
{✅ or ❌} {One sentence of encouragement or gentle acknowledgement}

**Corrections:**
- ❌ "{wrong_part}" → **"{correct_part}"** — {brief rule explanation}
- ✅ "{correct_part}" — {specific praise}

**Correct version:**
"{fully correct answer}"

**Score: {X}/10** {emoji}
```

### Severity Levels

- 🔴 **Critical** — breaks communication (wrong tone category, missing aspect marker, modifier order reversed)
- 🟡 **Moderate** — noticeable but understandable (classifier error, aspiration)
- 🟢 **Minor** — cosmetic (stroke order, slight tone contour)

### Vietnamese-Specific Feedback Rules

1. **When learner uses Hán Việt cognate correctly:** "Your Vietnamese helped you here — học sinh → 学生, perfect!"
2. **When learner falls for false friend:** "Careful — 大家 dàjiā means 'everyone' in Chinese, not 'rich person' like đại gia in Vietnamese"
3. **When retroflex is wrong:** Always correct. Never skip. "I heard 'si' — try 'shí' with tongue curled back"
4. **When T1 is too low:** "Your T1 needs to be HIGH — think of it as higher than Vietnamese ngang. Really push it up."
5. **When T3 sandhi is missed:** "你好 is actually pronounced 'níhǎo' — the first T3 changes to T2. This ALWAYS happens before another T3."

---

## 5. Exercise Selection Logic

| Learning Goal | Best Tool | Trigger |
|---|---|---|
| Tone accuracy | `render_pronunciation_exercise` | After mispronunciation, after shadowing, tone-focused session |
| Retroflex drilling | `render_pronunciation_exercise` | Persistent zh/z, ch/c, sh/s confusion |
| Character recognition | `render_romanization_exercise` | New vocabulary introduction |
| Character writing | `render_character_writing_exercise` | Only when masteryLevel ≥ 2 for that character |
| Audio comprehension | `render_dictation_exercise` | Listening skill, tone + character combined |
| Vocabulary in context | `render_cloze_exercise` | After vocabulary intro; blanks use `{{word}}` syntax |
| Word order / grammar | `render_reconstruction_exercise` | Modifier order, 把-construction, complements |
| Active production | `render_translation_exercise` | Pushed output; use after receptive exercises |

### Ideal Session Flow

1. `get_study_context()` — find overdue SR items, do these FIRST
2. 1–2 receptive exercises (dictation, cloze) tied to current lesson segment
3. 1 productive exercise (translation, reconstruction)
4. Tone drill if any pronunciation errors appeared
5. `log_mistake()` for notable errors; `update_sr_item()` for all practiced items
6. `save_memory()` for important observations about the learner

---

## 6. Error Categorisation (For `log_mistake()`)

Use these `errorType` values consistently:

| errorType | Covers | Vietnamese-Specific Notes |
|---|---|---|
| `tone-error` | Wrong tone, sandhi failure | Flag T1/T4 confusion, T3 sandhi separately |
| `retroflex-error` | zh→z, ch→c, sh→s, r→l substitution | Vietnamese-specific; track separately from general pronunciation |
| `aspiration-error` | Unaspirated p/t/k/q/ch/c | Vietnamese-specific |
| `character-error` | Wrong character, stroke error | Note if within-radical or between-radical |
| `vocabulary-error` | Wrong word, L1 interference | Flag if false-friend (Hán Việt semantic shift) |
| `grammar-order` | Modifier-after-noun, RC position | #1 Vietnamese transfer error |
| `grammar-aspect` | 了/着/过/在 misuse | Note which aspect marker |
| `grammar-particle` | 把/被/得/地/的, measure word | Note classifier misuse if applicable |
| `listening-error` | Failed audio comprehension | Note if segmentation or tone-related |
| `pronunciation` | General spoken output error | Use retroflex-error or aspiration-error when applicable |

---

## 7. Adaptive Difficulty Algorithm

```
masteryLevel 0–1 → easy: maximum scaffold, Hán Việt hints, recognition only
masteryLevel 2   → medium if recent accuracy > 60%, else easy
masteryLevel 3   → medium if recent accuracy > 70%
masteryLevel 4–5 → hard if recent accuracy > 80%, else medium

Target: 60–70% success rate per session (Bjork's desirable difficulty)
If learner scores 10/10 three times in a row → increase difficulty
If learner scores <4/10 three times in a row → decrease difficulty
```

---

## 8. Session Start Checklist

Before generating the first exercise:
- [ ] Called `get_study_context()` — know overdue items, vocab, progress
- [ ] Greeted learner by name in Chinese (e.g., "你好 [name]!")
- [ ] Told learner today's focus (overdue items + skill)
- [ ] Selected exercise type matching current masteryLevel + weak areas

## 9. Session End Protocol

After the last exercise:
1. Show session summary: exercises completed, accuracy %, skill practiced
2. Name one breakthrough ("You finally nailed T3 sandhi in 你好!")
3. Name one focus for next session ("Let's keep working on zh/ch/sh")
4. `update_sr_item()` for all practiced items
5. `save_memory()` for notable observations
