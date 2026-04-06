# Plan: Japanese Language Support

## Summary
Add full Japanese language support to ShadowLearn so users can create lessons from Japanese YouTube videos/audio, receive romaji romanization, Japanese TTS, and study via all existing exercise types. The codebase already has partial Japanese scaffolding (language config, frontend caps, subtitle connectors) but is missing the actual romanization backend, TTS voice routing, source language UI option, and several language-specific refinements.

## User Story
As a Japanese language learner,
I want to create lessons from Japanese videos and study them with transcription, romaji, translation, vocabulary, and TTS,
So that I can practice Japanese using the same shadowing workflow already available for Chinese.

## Problem → Solution
Currently Japanese is partially defined in config maps but unusable: no romaji generation, TTS hardcoded to Chinese voices, `ja` not in the source language dropdown, and character writing limited to CJK kanji only. → Full end-to-end Japanese pipeline: romaji via `pykakasi`, language-aware TTS voice selection, `ja` in all dropdowns, proper space handling in transcription, and kanji writing support (kana excluded — hanzi-writer doesn't support them).

## Metadata
- **Complexity**: Large
- **Source PRD**: N/A
- **PRD Phase**: N/A
- **Estimated Files**: ~18

---

## UX Design

### Before
```
┌──────────────────────────────────────┐
│  Create Lesson                       │
│  Video Language: [English ▼]         │
│    - English                         │
│    - Tiếng Việt                      │
│    - 中文                            │
│  (No Japanese option)                │
└──────────────────────────────────────┘
```

### After
```
┌──────────────────────────────────────┐
│  Create Lesson                       │
│  Video Language: [English ▼]         │
│    - English                         │
│    - Tiếng Việt                      │
│    - 中文                            │
│    - 日本語          ← NEW           │
│  (Full Japanese pipeline works)      │
└──────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Source language dropdown | en, vi, zh-CN | en, vi, zh-CN, ja | `LANGUAGES` constant |
| Romaji display | Empty (NullProvider) | Actual romaji above text | Backend generates romaji |
| TTS playback | Chinese voice reads Japanese text | Japanese voice (ja-JP) | Voice routed by language |
| Character writing | Kanji only (CJK U+4E00-9FFF) | Same — kanji only | Kana NOT supported by hanzi-writer; clarify via comments |
| Transcription spacing | Only Chinese strips spaces | Japanese also strips spaces | `_finalize_segment` + `_group_words_into_segments` (Deepgram already done) |
| TTS cache | Keyed by text only | Keyed by text + language | Prevents cross-language cache collisions |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 (critical) | `backend/app/services/romanization_provider.py` | all | Add JapaneseRomanizationProvider following existing pattern |
| P0 (critical) | `backend/app/services/tts_azure.py` | 14-25 | Hardcoded Chinese voice + SSML — must route by language |
| P0 (critical) | `backend/app/services/tts_provider.py` | all | TTSProvider protocol — needs language param |
| P0 (critical) | `backend/app/models.py` | 54-59 | TTSRequest model — needs source_language field |
| P0 (critical) | `frontend/src/hooks/useTTS.ts` | all | TTS hook — needs language awareness + cache key change |
| P0 (critical) | `frontend/src/lib/constants.ts` | all | Add `ja` to LANGUAGES array |
| P0 (critical) | `frontend/src/lib/language-caps.ts` | all | Japanese caps already defined; verify completeness |
| P1 (important) | `backend/app/services/language_config.py` | all | Japanese entry exists; verify |
| P1 (important) | `backend/app/services/transcription_provider.py` | 59-70 | `_finalize_segment` Chinese space-stripping — extend to Japanese |
| P1 (important) | `backend/app/services/transcription_azure.py` | 103-104 | Chinese space-stripping — extend to Japanese |
| P1 (important) | `backend/app/services/transcription_deepgram.py` | 100 | Already handles Japanese — no change needed |
| P1 (important) | `frontend/src/lib/hanzi-writer-chars.ts` | all | Clarify kana limitation via comments |
| P1 (important) | `backend/app/routers/tts.py` | all | TTS router — needs to pass language through |
| P2 (reference) | `backend/app/services/pinyin.py` | all | Reference for romaji service structure |
| P2 (reference) | `backend/tests/test_romanization_provider.py` | all | Test pattern to mirror |
| P2 (reference) | `backend/app/routers/lessons.py` | 40-70 | Pipeline flow: transcribe → romanize → translate → vocab |
| P2 (reference) | `frontend/src/components/create/CreateLesson.tsx` | 34, 213 | Source language select uses LANGUAGES |
| P2 (reference) | `backend/app/services/tts_minimax.py` | 1-30 | Minimax TTS — Chinese-only, needs language awareness |
| P2 (reference) | `frontend/src/db/index.ts` | TTS cache functions | TTS cache keyed by text — needs language in key |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| `pykakasi` — romaji converter | https://github.com/miurahr/pykakasi | Pure Python, no MeCab dependency. `kakasi.convert("日本語")` returns list of dicts with `hepburn` key |
| Azure TTS Japanese voices | Azure Cognitive Services docs | `ja-JP-NanamiNeural` (female), `ja-JP-KeitaNeural` (male) — must set `xml:lang='ja-JP'` in SSML |
| hanzi-writer Unicode support | hanzi-writer GitHub | Supports CJK Unified Ideographs (U+4E00-U+9FFF) only. Hiragana (U+3040-U+309F) and Katakana (U+30A0-U+30FF) are NOT supported |

---

## Patterns to Mirror

### NAMING_CONVENTION
```python
# SOURCE: backend/app/services/romanization_provider.py:11-18
class ChineseRomanizationProvider:
    def romanize_text(self, text: str) -> str:
        from app.services.pinyin import generate_pinyin
        return generate_pinyin(text)

    def romanize_word(self, word: str) -> str:
        from app.services.pinyin import generate_pinyin
        return generate_pinyin(word)
```

### ERROR_HANDLING
```python
# SOURCE: backend/app/services/tts_azure.py:68-82
try:
    return await _http_call()
except httpx.HTTPStatusError as exc:
    status = exc.response.status_code
    if status == 401:
        raise RuntimeError("Azure Speech key invalid or expired") from exc
```

### SERVICE_PATTERN
```python
# SOURCE: backend/app/services/pinyin.py:1-15
"""Pinyin generation service using pypinyin."""
from pypinyin import pinyin, Style

def generate_pinyin(chinese_text: str) -> str:
    if not chinese_text:
        return ""
    result = pinyin(chinese_text, style=Style.TONE, heteronym=False)
    return " ".join(item[0] for item in result)
```

### TEST_STRUCTURE
```python
# SOURCE: backend/tests/test_romanization_provider.py:8-11
def test_chinese_provider_returns_nonempty_string():
    p = ChineseRomanizationProvider()
    result = p.romanize_text("你好")
    assert isinstance(result, str) and result
```

### LANGUAGE_CONFIG_PATTERN
```python
# SOURCE: backend/app/services/language_config.py:3-8
_LANGUAGE_CONFIG: dict[str, dict] = {
    "zh-CN": {
        "language_name": "Chinese (Mandarin)",
        "romanization_label": "Pinyin",
        "romanization_description": 'pinyin with tone marks (e.g. "zhōng wén")',
    },
```

### FRONTEND_LANGUAGE_CAPS
```typescript
// SOURCE: frontend/src/lib/language-caps.ts:51-60
'ja': {
    romanizationSystem: 'romaji',
    romanizationLabel: 'Romaji',
    romanizationPlaceholder: 'e.g. konnichiwa',
    hasCharacterWriting: true,
    inputMode: 'standard',
    dictationPlaceholder: 'テキストを入力…',
    languageName: 'Japanese',
    azurePronunciationLocale: null,
  },
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/pyproject.toml` | UPDATE | Add `pykakasi>=2.2.1` dependency (must come first) |
| `backend/app/services/romaji.py` | CREATE | New romaji generation service (mirrors `pinyin.py`) |
| `backend/app/services/romanization_provider.py` | UPDATE | Add `JapaneseRomanizationProvider`, update `get_romanization_provider` |
| `backend/app/services/tts_provider.py` | UPDATE | Add `language` param to `synthesize` Protocol |
| `backend/app/services/tts_azure.py` | UPDATE | Accept `language` param, route voice + SSML lang by language |
| `backend/app/services/tts_minimax.py` | UPDATE | Accept `language` param, raise clear error for non-Chinese |
| `backend/app/models.py` | UPDATE | Add `source_language` field to `TTSRequest` |
| `backend/app/routers/tts.py` | UPDATE | Pass `source_language` to TTS synthesize |
| `backend/app/services/transcription_provider.py` | UPDATE | Extend `_finalize_segment` and `_group_words_into_segments` to handle `ja` |
| `backend/app/services/transcription_azure.py` | UPDATE | Extend space-stripping to `ja` |
| `frontend/src/lib/constants.ts` | UPDATE | Add `{ value: 'ja', label: '日本語' }` to LANGUAGES |
| `frontend/src/hooks/useTTS.ts` | UPDATE | Accept + send `source_language`, update cache key |
| `frontend/src/db/index.ts` | UPDATE | TTS cache functions: composite key `text + language` |
| `frontend/src/lib/hanzi-writer-chars.ts` | UPDATE | Add comments clarifying kana limitation |
| `frontend/src/components/study/exercises/CharacterWritingExercise.tsx` | UPDATE | Hide radical hints for Japanese |
| `backend/tests/test_romaji.py` | CREATE | Unit tests for romaji service |
| `backend/tests/test_romanization_provider.py` | UPDATE | Add Japanese provider tests |
| `backend/tests/test_tts_azure.py` | UPDATE | Test Japanese voice selection + SSML |

## NOT Building

- Furigana rendering (hiragana above kanji) — significant UI complexity, separate feature
- Japanese-specific IME input component (like `ChineseInput.tsx`) — standard keyboard input works
- Hiragana/katakana stroke-order writing practice — hanzi-writer only supports CJK kanji
- Japanese-specific grammar exercises or particles drill
- Kanji radical decomposition for Japanese — `hanzi` npm package is Chinese-specific
- Azure pronunciation assessment for Japanese (`ja-JP` not confirmed supported)
- Automatic TTS provider fallback (Minimax → Azure) — explicit error message instead

---

## Step-by-Step Tasks

Tasks follow TDD order: each group writes tests first (RED), then implements (GREEN), then refactors.

---

### Phase A: Romaji generation (backend)

#### Task 1: Add pykakasi dependency
- **ACTION**: Update `backend/pyproject.toml` to add `pykakasi>=2.2.1`, then `uv sync`
- **IMPLEMENT**: Add to `dependencies` list alongside `pypinyin>=0.53.0`
- **MIRROR**: Same pattern as existing `pypinyin` entry
- **GOTCHA**: Must be done before any code that imports pykakasi
- **VALIDATE**: `uv sync` succeeds, `python -c "import pykakasi"` works

#### Task 2: Write romaji tests (RED)
- **ACTION**: Create `backend/tests/test_romaji.py`
- **IMPLEMENT**: Tests for `generate_romaji`: basic kanji, hiragana, mixed scripts, empty input, punctuation. Tests will fail because `romaji.py` doesn't exist yet.
- **MIRROR**: TEST_STRUCTURE
- **IMPORTS**: `from app.services.romaji import generate_romaji`
- **GOTCHA**: pykakasi output format may vary — test for non-empty string rather than exact match for complex text. For simple cases like `"日本語"`, can assert `"nihongo"` is contained.
- **VALIDATE**: `pytest backend/tests/test_romaji.py -v` — all tests FAIL (RED)

#### Task 3: Implement romaji service (GREEN)
- **ACTION**: Create `backend/app/services/romaji.py`
- **IMPLEMENT**: A `generate_romaji(text: str) -> str` function using `pykakasi`. Initialize `kakasi` converter at module level. Convert Japanese text to Hepburn romaji. Handle empty input. Return space-separated romaji.
- **MIRROR**: SERVICE_PATTERN (mirrors `pinyin.py` structure exactly)
- **IMPORTS**: `import pykakasi`
- **GOTCHA**: `pykakasi` returns a list of dicts; join the `hepburn` values. Initialize the `kakasi` object at module level to avoid repeated setup cost.
- **VALIDATE**: `pytest backend/tests/test_romaji.py -v` — all tests PASS (GREEN)

#### Task 4: Write romanization provider tests (RED), then implement (GREEN)
- **ACTION**: Update `backend/tests/test_romanization_provider.py` with Japanese provider tests, then update `backend/app/services/romanization_provider.py`
- **IMPLEMENT**:
  - RED: Add `test_japanese_provider_returns_nonempty_string`, `test_get_romanization_provider_japanese` — tests fail because `JapaneseRomanizationProvider` doesn't exist
  - GREEN: Add `JapaneseRomanizationProvider` class with `romanize_text` and `romanize_word` methods that call `generate_romaji`. Update `get_romanization_provider` to return it for `ja` prefix.
- **MIRROR**: NAMING_CONVENTION (follows `ChineseRomanizationProvider` exactly)
- **IMPORTS**: Lazy import `from app.services.romaji import generate_romaji` inside methods
- **GOTCHA**: Use lazy imports like the Chinese provider does. Add `ja` check before the `en` check in the if-chain.
- **VALIDATE**: `pytest backend/tests/test_romanization_provider.py -v` — all tests PASS

---

### Phase B: TTS language routing (backend)

#### Task 5: Write TTS SSML tests (RED)
- **ACTION**: Create or update `backend/tests/test_tts_azure.py`
- **IMPLEMENT**: Test that `_build_ssml` with `language="ja"` produces SSML with `xml:lang='ja-JP'` and `ja-JP-NanamiNeural` voice. Test default language remains `zh-CN`. Test unknown language falls back to Chinese voice.
- **MIRROR**: TEST_STRUCTURE
- **IMPORTS**: `from app.services.tts_azure import _build_ssml`
- **GOTCHA**: `_build_ssml` is module-level, not a method — it's importable directly
- **VALIDATE**: `pytest backend/tests/test_tts_azure.py -v` — new tests FAIL (RED)

#### Task 6: Make TTS language-aware (GREEN)
- **ACTION**: Update `tts_provider.py`, `tts_azure.py`, `tts_minimax.py`, `models.py`, `routers/tts.py`
- **IMPLEMENT**:
  1. **`tts_provider.py`**: Add `language` param to `synthesize` Protocol: `async def synthesize(self, text: str, keys: TTSKeys, language: str = "zh-CN") -> bytes`
  2. **`tts_azure.py`**: Create `_VOICE_MAP` and `_LOCALE_MAP` dicts:
     ```python
     _VOICE_MAP = {
         "zh": "zh-CN-XiaoxiaoMultilingualNeural",
         "ja": "ja-JP-NanamiNeural",
         "en": "en-US-JennyNeural",
     }
     _LOCALE_MAP = {
         "zh": "zh-CN",
         "ja": "ja-JP",
         "en": "en-US",
     }
     ```
     Update `_build_ssml(text, language="zh-CN")` to resolve voice and locale from maps. Update `synthesize` to accept and forward `language`.
  3. **`tts_minimax.py`**: Add `language` param to `synthesize`. If `not language.startswith("zh")`, raise `ValueError("Minimax TTS only supports Chinese. Switch to Azure TTS provider for Japanese.")`.
  4. **`models.py`**: Add `source_language: str = "zh-CN"` to `TTSRequest`.
  5. **`routers/tts.py`**: Pass `body.source_language` to `provider.synthesize(body.text, keys, language=body.source_language)`.
- **MIRROR**: ERROR_HANDLING pattern for Minimax error case
- **GOTCHA**: The SSML `xml:lang` MUST match the voice's language or Azure returns garbage audio. The Protocol change uses a default value so existing callers don't break. Unknown language prefixes in `_VOICE_MAP` should fall back to Chinese.
- **VALIDATE**: `pytest backend/tests/test_tts_azure.py -v` — all tests PASS (GREEN)

---

### Phase C: Transcription space handling (backend)

#### Task 7: Extend transcription space handling for Japanese
- **ACTION**: Update `backend/app/services/transcription_provider.py` and `backend/app/services/transcription_azure.py`
- **IMPLEMENT**:
  1. In `transcription_provider.py` `_finalize_segment` (line 62): Change `if language.startswith("zh"):` to `if language.startswith("zh") or language.startswith("ja"):`
  2. Same change in `_group_words_into_segments` (line 100-101).
  3. In `transcription_azure.py` line 103: Same change.
  4. **No change needed** in `transcription_deepgram.py` — already handles Japanese at line 100.
- **MIRROR**: Existing conditional pattern
- **IMPORTS**: None
- **GOTCHA**: Japanese transcription from Azure/Deepgram inserts spaces between words. Stripping them creates natural Japanese text display. `word_timings` still preserve individual word boundaries for highlighting. Consider extracting the check into a helper like `_is_spaceless_script(language)` to avoid repeating the condition, but only if there are 3+ occurrences (there are exactly 3 in `transcription_provider.py` + 1 in `transcription_azure.py` = 4 total, so a helper is warranted).
- **VALIDATE**: Existing tests in `test_transcription_deepgram.py` still pass. Add a test for `_finalize_segment` with `language="ja"` to `test_transcription_deepgram.py`.

---

### Phase D: Frontend changes

#### Task 8: Add Japanese to source language dropdown
- **ACTION**: Update `frontend/src/lib/constants.ts`
- **IMPLEMENT**: Add `{ value: 'ja', label: '日本語' }` to `LANGUAGES` array
- **MIRROR**: Existing entries pattern
- **IMPORTS**: None
- **GOTCHA**: This single change enables Japanese in both the source language AND translation language dropdowns in CreateLesson, since both use `LANGUAGES`.
- **VALIDATE**: `ja` appears in the Video Language dropdown when running the app

#### Task 9: Thread language through TTS frontend
- **ACTION**: Update `frontend/src/hooks/useTTS.ts`, `frontend/src/db/index.ts`
- **IMPLEMENT**:
  1. **`useTTS.ts`**: Change `playTTS` signature to accept optional language: `playTTS(text: string, language?: string)`. Send `source_language` in the request body to `/api/tts`. Update the TTS cache key to include language (e.g., `${language ?? 'zh-CN'}::${text}`).
  2. **`db/index.ts`**: Update `getTTSCache` and `saveTTSCache` to use the composite key `language::text` instead of just `text`. This prevents a Chinese-voiced cached audio from being returned for Japanese text.
  3. **Callers**: Most callers of `playTTS` are in study exercises and workbook components. They have access to `lesson.sourceLanguage` or `caps`. Pass the language through where available. For callers where language isn't readily available, the default `"zh-CN"` preserves backward compatibility.
- **MIRROR**: Existing hook pattern — stable callback via refs
- **IMPORTS**: None new
- **GOTCHA**: The cache key change means existing TTS cache entries (keyed by text only) will miss on first request — this is acceptable, they'll be re-fetched and cached with the new key format. No migration needed. Ensure `playTTS` callback remains stable (ref-based) to avoid re-render cascades.
- **VALIDATE**: TTS plays Japanese voice for Japanese lessons, Chinese voice for Chinese lessons. Cache doesn't cross-contaminate.

#### Task 10: Update hanzi-writer character support comments
- **ACTION**: Update `frontend/src/lib/hanzi-writer-chars.ts`
- **IMPLEMENT**: Add comments clarifying that `isWritingSupported` intentionally checks only CJK kanji range (U+4E00-U+9FFF), which covers both Chinese characters and Japanese kanji. Hiragana (U+3040-U+309F) and Katakana (U+30A0-U+30FF) are NOT supported by hanzi-writer.
- **MIRROR**: N/A — documentation clarification
- **IMPORTS**: None
- **GOTCHA**: Do NOT add hiragana/katakana ranges. `isWritingSupported("漢")` → true, `isWritingSupported("あ")` → false — this is correct behavior.
- **VALIDATE**: No functional change; existing behavior preserved

#### Task 11: Guard CharacterWritingExercise for Japanese
- **ACTION**: Update `frontend/src/components/study/exercises/CharacterWritingExercise.tsx`
- **IMPLEMENT**: The `hanzi.decompose()` call (line ~46-49) is Chinese-specific. The existing try-catch handles failures safely, but the radical hint UI should be hidden for Japanese to avoid confusing results. Check `caps.romanizationSystem !== 'pinyin'` (or `=== 'romaji'`) to conditionally disable the radical hint button for Japanese lessons. The `caps` prop is already passed to this component.
- **MIRROR**: Existing try-catch pattern
- **IMPORTS**: None
- **GOTCHA**: `hanzi.decompose()` may return data for Japanese kanji that share CJK codepoints with Chinese characters, but the decomposition is Chinese-specific and may be misleading. Hiding the hint is the safest UX.
- **VALIDATE**: Japanese writing exercise shows stroke practice but no radical hints

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `test_generate_romaji_basic` | `"日本語"` | Non-empty string containing "nihongo" | No |
| `test_generate_romaji_empty` | `""` | `""` | Yes |
| `test_generate_romaji_hiragana` | `"こんにちは"` | Non-empty romaji string | No |
| `test_generate_romaji_mixed` | `"東京タワー"` | Non-empty romaji string | No |
| `test_generate_romaji_punctuation` | `"こんにちは！"` | Non-empty string, punctuation preserved | Yes |
| `test_japanese_provider_returns_nonempty` | `JapaneseRomanizationProvider().romanize_text("日本語")` | Non-empty string | No |
| `test_get_romanization_provider_ja` | `get_romanization_provider("ja")` | `JapaneseRomanizationProvider` instance | No |
| `test_azure_ssml_japanese_voice` | `_build_ssml("テスト", "ja")` | Contains `ja-JP` and `NanamiNeural` | No |
| `test_azure_ssml_default_chinese` | `_build_ssml("测试")` | Contains `zh-CN` | No |
| `test_azure_ssml_unknown_lang_fallback` | `_build_ssml("text", "xx")` | Falls back to `zh-CN` | Yes |
| `test_finalize_segment_japanese_strips_spaces` | Words with spaces, language="ja" | Segment text has no spaces | No |
| `test_minimax_rejects_japanese` | `synthesize("テスト", keys, language="ja")` | Raises `ValueError` with clear message | Yes |

### Edge Cases Checklist
- [x] Empty input (romaji generation)
- [ ] Mixed scripts (kanji + hiragana + katakana + Latin)
- [ ] Punctuation preservation in romaji
- [ ] TTS with unknown language falls back to Chinese voice gracefully
- [ ] Minimax TTS rejects non-Chinese with clear user-facing message
- [ ] Character writing with pure hiragana word (should filter out via `isWritingSupported`)
- [ ] TTS cache key collision between same text in different languages

---

## Validation Commands

### Static Analysis
```bash
# Frontend type check
cd frontend && npx tsc --noEmit --pretty false
```
EXPECT: Zero type errors

### Backend Tests
```bash
cd backend && uv run pytest tests/test_romaji.py tests/test_romanization_provider.py tests/test_tts_azure.py tests/test_transcription_deepgram.py -v
```
EXPECT: All tests pass

### Full Backend Test Suite
```bash
cd backend && uv run pytest -x -v
```
EXPECT: No regressions

### Frontend Tests
```bash
cd frontend && npx vitest run
```
EXPECT: No regressions

### Dependency Install
```bash
cd backend && uv sync
```
EXPECT: pykakasi installed successfully

### Manual Validation
- [ ] Open Create Lesson page → "日本語" appears in Video Language dropdown
- [ ] Create a lesson from a Japanese YouTube video → pipeline completes
- [ ] Segments show Japanese text with romaji annotations
- [ ] TTS plays Japanese audio with Japanese voice (not Chinese voice)
- [ ] TTS for Chinese lessons still plays Chinese voice (no regression)
- [ ] Vocabulary words have romaji in the romanization field
- [ ] Study exercises work: cloze, dictation, romaji recall, character writing (kanji only)
- [ ] Shadowing mode works with Japanese audio
- [ ] Character writing exercise shows kanji strokes but no radical hints for Japanese
- [ ] Writing exercise correctly skips pure hiragana/katakana words
- [ ] Minimax TTS + Japanese source language shows clear error message

---

## Acceptance Criteria
- [ ] All tasks completed
- [ ] All validation commands pass
- [ ] Tests written and passing
- [ ] No type errors
- [ ] No lint errors
- [ ] Japanese appears as source language in Create Lesson
- [ ] Full pipeline works: YouTube → transcription → romaji → translation → vocabulary
- [ ] TTS speaks Japanese with Japanese voice
- [ ] All study exercises functional with Japanese content
- [ ] TTS cache correctly separated by language

## Completion Checklist
- [ ] Code follows discovered patterns (lazy imports, Protocol adherence, existing test style)
- [ ] Error handling matches codebase style (RuntimeError with descriptive messages)
- [ ] Logging follows codebase conventions (`logger.info` for progress, `logger.warning` for issues)
- [ ] Tests follow test patterns (simple assertions, smoke tests for provider wiring)
- [ ] No hardcoded values (voice names in a map, not inline)
- [ ] No unnecessary scope additions (no furigana, no kana writing, no Japanese IME)
- [ ] Self-contained — no questions needed during implementation

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `pykakasi` romaji quality for complex sentences | Medium | Medium | Test with real Japanese content; pykakasi is mature and widely used |
| Azure TTS SSML voice name changes | Low | High | Use well-documented Neural voices; add test to catch breakage |
| Minimax TTS doesn't support Japanese | High | Low | Clear error message directing user to switch to Azure TTS |
| hanzi-writer stroke data missing for some kanji | Low | Low | Existing try-catch in HanziWriterCanvas handles missing chars |
| Japanese transcription word boundary differences | Medium | Medium | Space-stripping matches Chinese approach; word_timings preserve boundaries |
| `hanzi.decompose()` returns wrong data for Japanese kanji | Medium | Low | Already wrapped in try-catch; hide radical hint for Japanese |
| TTS cache key migration | Low | Low | Old cache entries simply miss; re-fetched with new key format. No data loss |
| `playTTS` callers missing language param | Medium | Low | Default `"zh-CN"` preserves backward compat; Chinese lessons unaffected |

## Notes
- The codebase was designed with multi-language support in mind — `language_config.py`, `language-caps.ts`, `romanization_provider.py` all use pluggable patterns. Japanese is the second CJK language, so most infrastructure exists.
- `pykakasi` is preferred over `cutlet` because it's pure Python with no system dependencies (cutlet requires MeCab C library).
- The existing `ja` entry in `language-caps.ts` has `hasCharacterWriting: true` — this is correct for kanji but kana strokes are not available.
- Azure pronunciation assessment for Japanese (`ja-JP`) should be left as `null` for now — it's not confirmed supported and can be enabled later if verified.
- The `LANGUAGES` constant in `constants.ts` serves double duty for both source language and translation language dropdowns. Adding `ja` enables both.
- **Deepgram already handles Japanese** space-stripping at `transcription_deepgram.py:100` — only `transcription_provider.py` (shared module) and `transcription_azure.py` need the fix.
- TTS cache key change is backward-compatible: old entries simply won't be found (cache miss), and new entries use the `language::text` format. No migration needed.
