# Vocabulary Workbook Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vocabulary Workbook where users save words from lesson transcripts, browse them grouped by lesson, and practice with five AI-powered exercise types.

**Architecture:** All vocabulary data lives in a new `vocabulary` IndexedDB store (DB v2→v3). The save flow hooks into the existing `SegmentText` tooltip via a new `onSaveWord` prop wired through `TranscriptPanel`. Study sessions are full-screen routes (`/vocabulary/:lessonId/study`) with a mode picker, exercise loop, and summary screen. Two new backend endpoints handle AI quiz generation (OpenRouter) and Azure pronunciation assessment (with ffmpeg transcoding).

**Tech Stack:** React 19 + TypeScript, shadcn/ui, idb (IndexedDB), vitest, FastAPI, azure-cognitiveservices-speech, ffmpeg.

---

## Chunk 1: Foundation — Types, DB, and Core Hook

### Task 1: Extend types and DB schema

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/db/index.ts`
- Test: `frontend/tests/db.test.ts`

- [ ] **Read the files before editing**

  ```bash
  # Read the current state
  cat frontend/src/types.ts
  cat frontend/src/db/index.ts
  ```

- [ ] **Add `VocabEntry` type and extend `DecryptedKeys` in `types.ts`**

  After the existing `DecryptedKeys` interface, add:

  ```typescript
  // In types.ts — extend DecryptedKeys:
  export interface DecryptedKeys {
    openaiApiKey: string        // required, unchanged
    deepgramApiKey?: string
    minimaxApiKey?: string
    azureSpeechKey?: string     // new
    azureSpeechRegion?: string  // new (e.g. "eastus")
  }

  // New type — add after DecryptedKeys:
  export interface VocabEntry {
    id: string
    word: string
    pinyin: string
    meaning: string
    usage: string
    sourceLessonId: string
    sourceLessonTitle: string
    sourceSegmentId: string
    sourceSegmentChinese: string
    sourceSegmentTranslation: string
    createdAt: string
  }
  ```

- [ ] **Write a failing test for the new DB store in `frontend/tests/db.test.ts`**

  Open the existing `db.test.ts` and add a test block:

  ```typescript
  describe('vocabulary store', () => {
    it('saves and retrieves a VocabEntry by lesson', async () => {
      const db = await initDB()
      const entry: VocabEntry = {
        id: 'test-id-1',
        word: '今天',
        pinyin: 'jīntiān',
        meaning: 'today',
        usage: '今天天气很好。',
        sourceLessonId: 'lesson_abc',
        sourceLessonTitle: 'Test Lesson',
        sourceSegmentId: 'seg_001',
        sourceSegmentChinese: '今天天气非常好！',
        sourceSegmentTranslation: 'The weather is nice today!',
        createdAt: new Date().toISOString(),
      }
      await db.put('vocabulary', entry)
      const results = await db.getAllFromIndex('vocabulary', 'by-lesson', 'lesson_abc')
      expect(results).toHaveLength(1)
      expect(results[0].word).toBe('今天')
    })
  })
  ```

- [ ] **Run test to verify it fails**

  ```bash
  cd frontend && npx vitest run tests/db.test.ts 2>&1 | tail -20
  ```

  Expected: FAIL — `vocabulary` store does not exist yet.

- [ ] **Bump DB version 2→3 and add `vocabulary` store in `frontend/src/db/index.ts`**

  Change the `openDB` call version from `2` to `3` and add the new upgrade block (keeping the existing `oldVersion < 2` block intact):

  ```typescript
  // In the upgrade handler, after the existing `if (oldVersion < 2) { ... }` block:
  if (oldVersion < 3) {
    const vocabStore = db.createObjectStore('vocabulary', { keyPath: 'id' })
    vocabStore.createIndex('by-lesson', 'sourceLessonId', { unique: false })
    vocabStore.createIndex('by-date', 'createdAt', { unique: false })
  }
  ```

  Also update the TypeScript `DBSchema` interface (or equivalent) to include:

  ```typescript
  vocabulary: {
    key: string
    value: VocabEntry
    indexes: { 'by-lesson': string; 'by-date': string }
  }
  ```

- [ ] **Run test to verify it passes**

  ```bash
  cd frontend && npx vitest run tests/db.test.ts 2>&1 | tail -20
  ```

  Expected: PASS.

- [ ] **Commit**

  ```bash
  git add frontend/src/types.ts frontend/src/db/index.ts frontend/tests/db.test.ts
  git commit -m "feat: add VocabEntry type, vocabulary IDB store (v3), Azure key fields"
  ```

---

### Task 2: `useVocabulary` hook

**Files:**
- Create: `frontend/src/hooks/useVocabulary.ts`
- Test: `frontend/tests/useVocabulary.test.ts`

- [ ] **Write failing tests**

  Create `frontend/tests/useVocabulary.test.ts`:

  ```typescript
  import { renderHook, act } from '@testing-library/react'
  import { describe, expect, it, vi, beforeEach } from 'vitest'
  import { useVocabulary } from '@/hooks/useVocabulary'
  import type { Word, Segment, LessonMeta } from '@/types'

  // Mock AuthContext
  vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ db: mockDb, keys: null }),
  }))

  const mockDb = {
    getAll: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAllFromIndex: vi.fn().mockResolvedValue([]),
  }

  const word: Word = { word: '今天', pinyin: 'jīntiān', meaning: 'today', usage: '今天很好。' }
  const segment: Segment = {
    id: 'seg_001', start: 0, end: 5,
    chinese: '今天天气非常好！', pinyin: '...', translations: { en: 'Nice today!' },
    words: [word],
  }
  const lesson: LessonMeta = {
    id: 'lesson_abc', title: 'Test', source: 'youtube', sourceUrl: null,
    translationLanguages: ['en'], createdAt: '', lastOpenedAt: '',
    progressSegmentId: null, tags: [],
  }

  describe('useVocabulary', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('isSaved returns false when entry not in list', () => {
      mockDb.getAll.mockResolvedValue([])
      const { result } = renderHook(() => useVocabulary())
      expect(result.current.isSaved('今天', 'lesson_abc')).toBe(false)
    })

    it('save writes a VocabEntry with correct fields', async () => {
      const { result } = renderHook(() => useVocabulary())
      await act(async () => {
        await result.current.save(word, segment, lesson, 'en')
      })
      expect(mockDb.put).toHaveBeenCalledWith('vocabulary', expect.objectContaining({
        word: '今天',
        pinyin: 'jīntiān',
        sourceLessonId: 'lesson_abc',
        sourceSegmentId: 'seg_001',
        sourceSegmentTranslation: 'Nice today!',
      }))
    })

    it('isSaved returns true after save', async () => {
      const entry = { id: 'x', word: '今天', sourceLessonId: 'lesson_abc', createdAt: '' }
      mockDb.getAll.mockResolvedValue([entry])
      const { result } = renderHook(() => useVocabulary())
      // Allow effect to run
      await act(async () => {})
      expect(result.current.isSaved('今天', 'lesson_abc')).toBe(true)
    })

    it('remove calls db.delete with entry id', async () => {
      const { result } = renderHook(() => useVocabulary())
      await act(async () => { await result.current.remove('entry-id') })
      expect(mockDb.delete).toHaveBeenCalledWith('vocabulary', 'entry-id')
    })
  })
  ```

- [ ] **Run failing tests**

  ```bash
  cd frontend && npx vitest run tests/useVocabulary.test.ts 2>&1 | tail -20
  ```

  Expected: FAIL — hook does not exist.

- [ ] **Implement `useVocabulary`**

  Create `frontend/src/hooks/useVocabulary.ts`:

  ```typescript
  import { useCallback, useEffect, useMemo, useState } from 'react'
  import { useAuth } from '@/contexts/AuthContext'
  import type { LessonMeta, Segment, VocabEntry, Word } from '@/types'

  export function useVocabulary() {
    const { db } = useAuth()
    const [entries, setEntries] = useState<VocabEntry[]>([])

    useEffect(() => {
      if (!db) return
      db.getAll('vocabulary').then(setEntries)
    }, [db])

    const entriesByLesson = useMemo(() => {
      const map: Record<string, VocabEntry[]> = {}
      for (const e of entries) {
        ;(map[e.sourceLessonId] ??= []).push(e)
      }
      return map
    }, [entries])

    const save = useCallback(
      async (word: Word, segment: Segment, lesson: LessonMeta, activeLang: string) => {
        if (!db) return
        const entry: VocabEntry = {
          id: crypto.randomUUID(),
          word: word.word,
          pinyin: word.pinyin,
          meaning: word.meaning,
          usage: word.usage,
          sourceLessonId: lesson.id,
          sourceLessonTitle: lesson.title,
          sourceSegmentId: segment.id,
          sourceSegmentChinese: segment.chinese,
          sourceSegmentTranslation: segment.translations[activeLang] ?? '',
          createdAt: new Date().toISOString(),
        }
        await db.put('vocabulary', entry)
        setEntries(prev => [...prev, entry])
      },
      [db],
    )

    const remove = useCallback(
      async (id: string) => {
        if (!db) return
        await db.delete('vocabulary', id)
        setEntries(prev => prev.filter(e => e.id !== id))
      },
      [db],
    )

    const isSaved = useCallback(
      (word: string, lessonId: string) =>
        entries.some(e => e.word === word && e.sourceLessonId === lessonId),
      [entries],
    )

    return { entries, entriesByLesson, save, remove, isSaved }
  }
  ```

- [ ] **Run tests to verify they pass**

  ```bash
  cd frontend && npx vitest run tests/useVocabulary.test.ts 2>&1 | tail -20
  ```

  Expected: PASS.

- [ ] **Commit**

  ```bash
  git add frontend/src/hooks/useVocabulary.ts frontend/tests/useVocabulary.test.ts
  git commit -m "feat: add useVocabulary hook with save/remove/isSaved"
  ```

---

### Task 3: Pinyin utilities

**Files:**
- Create: `frontend/src/lib/pinyin-utils.ts`
- Test: `frontend/tests/pinyin-utils.test.ts`

- [ ] **Write failing tests**

  Create `frontend/tests/pinyin-utils.test.ts`:

  ```typescript
  import { describe, expect, it } from 'vitest'
  import { normalizePinyin, comparePinyin } from '@/lib/pinyin-utils'

  describe('normalizePinyin', () => {
    it('strips tone marks to base pinyin', () => {
      expect(normalizePinyin('jīntiān')).toBe('jintian')
      expect(normalizePinyin('fēicháng')).toBe('feichang')
      expect(normalizePinyin('nǐ hǎo')).toBe('ni hao')
    })

    it('converts tone numbers to base pinyin', () => {
      expect(normalizePinyin('jin1tian1')).toBe('jintian')
      expect(normalizePinyin('fei1chang2')).toBe('feichang')
    })

    it('lowercases and trims', () => {
      expect(normalizePinyin(' JīnTiān ')).toBe('jintian')
    })
  })

  describe('comparePinyin', () => {
    it('matches tone marks to tone numbers', () => {
      expect(comparePinyin('jīntiān', 'jin1tian1')).toBe(true)
    })
    it('returns false for wrong pinyin', () => {
      expect(comparePinyin('jīntiān', 'jin2tian1')).toBe(false)
    })
    it('is whitespace-insensitive', () => {
      expect(comparePinyin('jīn tiān', 'jin1 tian1')).toBe(true)
    })
  })
  ```

- [ ] **Run to verify failure**

  ```bash
  cd frontend && npx vitest run tests/pinyin-utils.test.ts 2>&1 | tail -10
  ```

- [ ] **Implement `pinyin-utils.ts`**

  Create `frontend/src/lib/pinyin-utils.ts`:

  ```typescript
  // Map of tone-marked vowels to base vowel
  const TONE_MAP: Record<string, string> = {
    āáǎà: 'a', ēéěè: 'e', īíǐì: 'i',
    ōóǒò: 'o', ūúǔù: 'u', ǖǘǚǜ: 'u', ńň: 'n',
  }

  function stripToneMarks(s: string): string {
    let result = s
    for (const [marked, base] of Object.entries(TONE_MAP)) {
      for (const ch of marked) result = result.replaceAll(ch, base)
    }
    return result
  }

  function stripToneNumbers(s: string): string {
    return s.replace(/[1-4]/g, '')
  }

  /** Normalise any pinyin representation to lowercase base pinyin (no tones, no spaces). */
  export function normalizePinyin(raw: string): string {
    const lower = raw.trim().toLowerCase()
    // Determine if tone marks or tone numbers are used
    const hasToneMarks = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńň]/.test(lower)
    const base = hasToneMarks ? stripToneMarks(lower) : stripToneNumbers(lower)
    return base.replace(/\s+/g, '')
  }

  /** Compare two pinyin strings regardless of whether they use tone marks or tone numbers. */
  export function comparePinyin(a: string, b: string): boolean {
    return normalizePinyin(a) === normalizePinyin(b)
  }
  ```

- [ ] **Run tests to verify they pass**

  ```bash
  cd frontend && npx vitest run tests/pinyin-utils.test.ts 2>&1 | tail -10
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/lib/pinyin-utils.ts frontend/tests/pinyin-utils.test.ts
  git commit -m "feat: add pinyin normalisation utilities (tone marks ↔ tone numbers)"
  ```

---

## Chunk 2: Save Integration — Tooltip, TranscriptPanel, Deep-link

### Task 4: Save button in `SegmentText` tooltip

**Files:**
- Modify: `frontend/src/components/lesson/SegmentText.tsx`
- Test: `frontend/tests/SegmentText.test.ts` (extend existing)

- [ ] **Read the file**

  ```bash
  cat frontend/src/components/lesson/SegmentText.tsx
  ```

- [ ] **Add `onSaveWord` prop to the interface and a bookmark button inside the tooltip**

  In `SegmentText.tsx`:

  1. Import `Bookmark` from `lucide-react` and `type { Segment } from '@/types'`
  2. Add to props interface:
     ```typescript
     onSaveWord?: (word: Word, segment: Segment) => void
     isSaved?: (word: string) => boolean
     segment?: Segment
     ```
  3. Inside the tooltip action buttons row (alongside the existing Copy + Play buttons), add:
     ```tsx
     {onSaveWord && segment && word && (
       <Button
         size="icon"
         variant="ghost"
         className="size-7"
         onClick={() => onSaveWord(word, segment)}
         title={isSaved?.(word.word) ? 'Already in Workbook' : 'Save to Workbook'}
         disabled={isSaved?.(word.word)}
       >
         <Bookmark
           className={cn('size-4', isSaved?.(word.word) && 'fill-current')}
         />
       </Button>
     )}
     ```

- [ ] **Write tests for the new save button** in `frontend/tests/SegmentText.test.ts`

  Add to the existing test file (do not delete existing tests):

  ```typescript
  // At the top of existing test file, check if it tests DOM — if it only tests
  // utility functions (buildWordSpans etc.), add a separate component test file:
  // frontend/tests/SegmentText.save.test.tsx

  import { render, screen, fireEvent } from '@testing-library/react'
  import { SegmentText } from '@/components/lesson/SegmentText'
  import type { Segment, Word } from '@/types'

  const word: Word = { word: '今天', pinyin: 'jīntiān', meaning: 'today', usage: '今天很好。' }
  const segment: Segment = {
    id: 'seg_1', start: 0, end: 5,
    chinese: '今天好', pinyin: '...', translations: { en: 'Nice' }, words: [word],
  }

  it('calls onSaveWord when bookmark button clicked', async () => {
    const onSave = vi.fn()
    render(
      <SegmentText
        text="今天好"
        words={[word]}
        playTTS={vi.fn()}
        loadingText={null}
        onSaveWord={onSave}
        segment={segment}
        isSaved={() => false}
      />
    )
    // Hover over the word to reveal tooltip — find the bookmark button
    // (In vitest/jsdom tooltips may need explicit hover)
    const char = screen.getByText('今')
    fireEvent.mouseEnter(char)
    const btn = await screen.findByTitle('Save to Workbook')
    fireEvent.click(btn)
    expect(onSave).toHaveBeenCalledWith(word, segment)
  })
  ```

  > Note: If `SegmentText.test.ts` only tests pure functions (it does — it tests `buildWordSpans`), create the component test as `frontend/tests/SegmentText.save.test.tsx` instead.

- [ ] **Run tests**

  ```bash
  cd frontend && npx vitest run tests/SegmentText.test.ts 2>&1 | tail -20
  ```

  Existing tests must still pass. New component test may need a DOM environment — check `vitest.config.ts` for `environment: 'jsdom'`.

- [ ] **Commit**

  ```bash
  git add frontend/src/components/lesson/SegmentText.tsx frontend/tests/SegmentText.save.test.tsx
  git commit -m "feat: add save-to-workbook bookmark button to word tooltip"
  ```

---

### Task 5: Wire `onSaveWord` in `TranscriptPanel`

**Files:**
- Modify: `frontend/src/components/lesson/TranscriptPanel.tsx`

- [ ] **Read the file**

  ```bash
  cat frontend/src/components/lesson/TranscriptPanel.tsx
  ```

- [ ] **Add `useVocabulary` and wire `onSaveWord`**

  1. Import `useVocabulary` and `toast` from sonner
  2. Inside the component, call:
     ```typescript
     const { save, isSaved } = useVocabulary()
     ```
  3. In the `<SegmentText>` render call, add the three new props:
     ```tsx
     <SegmentText
       // ...existing props...
       segment={segment}
       onSaveWord={async (word, seg) => {
         await save(word, seg, lesson, activeLang)
         toast.success('Saved to Workbook')
       }}
       isSaved={(wordText) => isSaved(wordText, lesson.id)}
     />
     ```

- [ ] **Verify the lesson view still compiles and runs**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Commit**

  ```bash
  git add frontend/src/components/lesson/TranscriptPanel.tsx
  git commit -m "feat: wire save-to-workbook in TranscriptPanel via useVocabulary"
  ```

---

### Task 6: Deep-link — `?segmentId=` in `LessonView`

**Files:**
- Modify: `frontend/src/components/lesson/LessonView.tsx`

- [ ] **Read the top of LessonView to understand its structure**

  ```bash
  head -80 frontend/src/components/lesson/LessonView.tsx
  ```

- [ ] **Add `useSearchParams` and scroll/seek effect**

  1. Add import: `import { useSearchParams } from 'react-router-dom'`
  2. Inside the component, after existing hooks:
     ```typescript
     const [searchParams] = useSearchParams()
     const deepLinkSegmentId = searchParams.get('segmentId')
     ```
  3. Add a `useEffect` that fires after segments load:
     ```typescript
     useEffect(() => {
       if (!deepLinkSegmentId || segments.length === 0) return
       const target = segments.find(s => s.id === deepLinkSegmentId)
       if (!target) return
       // Seek video
       seekTo(target.start)           // use existing player seek — check what's available
       // Scroll transcript — find the segment's DOM node by data attribute or ref
       document.querySelector(`[data-segment-id="${deepLinkSegmentId}"]`)
         ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
     }, [segments, deepLinkSegmentId])
     ```
     > Check how `LessonView` controls the video player — look for `seekTo` or similar in `PlayerContext`. Adapt if the API differs.

  4. Ensure each segment row in the transcript has `data-segment-id={segment.id}` — check `TranscriptPanel.tsx` and add the attribute if missing.

- [ ] **Verify TypeScript compiles**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/lesson/LessonView.tsx frontend/src/components/lesson/TranscriptPanel.tsx
  git commit -m "feat: support ?segmentId= deep-link in LessonView for source segment navigation"
  ```

---

### Task 7: Azure key fields in Settings + Workbook nav link

**Files:**
- Modify: `frontend/src/components/onboarding/Setup.tsx`
- Modify: `frontend/src/components/Settings.tsx` (check exact path)
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Read the files**

  ```bash
  cat frontend/src/components/onboarding/Setup.tsx
  cat frontend/src/components/Layout.tsx
  # Find Settings:
  find frontend/src -name 'Settings.tsx' | head -3
  ```

- [ ] **Add Azure fields to `Setup.tsx`**

  Following the same pattern as `minimaxApiKey` (optional field):

  ```typescript
  // Add state:
  const [azureSpeechKey, setAzureSpeechKey] = useState('')
  const [azureSpeechRegion, setAzureSpeechRegion] = useState('')

  // Pass to setup():
  await setup({
    openaiApiKey: openaiApiKey.trim(),
    minimaxApiKey: minimaxApiKey.trim() || undefined,
    deepgramApiKey: deepgramApiKey.trim() || undefined,
    azureSpeechKey: azureSpeechKey.trim() || undefined,
    azureSpeechRegion: azureSpeechRegion.trim() || undefined,
  }, pin)
  ```

  Add two `<Input>` fields in the form with labels "Azure Speech Key (optional)" and "Azure Speech Region (optional, e.g. eastus)".

- [ ] **Add Azure fields to `Settings.tsx`** with the same pattern as existing optional key editing.

- [ ] **Add Workbook link to `Layout.tsx`**

  In the nav, alongside the Settings icon, add:

  ```tsx
  import { Link, useLocation } from 'react-router-dom'
  // ...
  const location = useLocation()
  // In nav:
  <Button
    variant="ghost"
    size="sm"
    asChild
    className={cn(location.pathname.startsWith('/vocabulary') && 'bg-accent')}
  >
    <Link to="/vocabulary">Workbook</Link>
  </Button>
  ```

- [ ] **Type-check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/onboarding/Setup.tsx \
         frontend/src/components/Layout.tsx
  git commit -m "feat: add Azure Speech key fields to Setup/Settings, Workbook nav link"
  ```

---

## Chunk 3: Workbook Page

### Task 8: `WordCard` component

**Files:**
- Create: `frontend/src/components/workbook/WordCard.tsx`

- [ ] **Implement `WordCard`**

  Create `frontend/src/components/workbook/WordCard.tsx`:

  ```tsx
  import type { VocabEntry } from '@/types'
  import { cn } from '@/lib/utils'

  interface WordCardProps {
    entry: VocabEntry
    className?: string
  }

  export function WordCard({ entry, className }: WordCardProps) {
    const seg = entry.sourceSegmentId
    // Display timestamp from sourceSegmentChinese if available
    return (
      <div className={cn('bg-background p-3 hover:bg-accent/50 transition-colors cursor-default', className)}>
        <div className="text-lg font-bold">{entry.word}</div>
        <div className="text-sm text-muted-foreground italic mt-0.5">{entry.pinyin}</div>
        <div className="text-sm text-muted-foreground mt-1 truncate">{entry.meaning}</div>
        <div className="text-sm text-muted-foreground/40 mt-1.5">{seg}</div>
      </div>
    )
  }
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/workbook/WordCard.tsx
  git commit -m "feat: add WordCard component for vocabulary preview grid"
  ```

---

### Task 9: `LessonGroup` component

**Files:**
- Create: `frontend/src/components/workbook/LessonGroup.tsx`

- [ ] **Implement `LessonGroup`**

  Create `frontend/src/components/workbook/LessonGroup.tsx`:

  ```tsx
  import { useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { Button } from '@/components/ui/button'
  import { WordCard } from './WordCard'
  import type { VocabEntry } from '@/types'
  import { cn } from '@/lib/utils'

  interface LessonGroupProps {
    lessonId: string
    lessonTitle: string
    entries: VocabEntry[]
  }

  const PREVIEW_COUNT = 5

  export function LessonGroup({ lessonId, lessonTitle, entries }: LessonGroupProps) {
    const [expanded, setExpanded] = useState(false)
    const navigate = useNavigate()
    const lastSaved = entries.reduce((latest, e) =>
      e.createdAt > latest ? e.createdAt : latest, '')
    const lastSavedDate = new Date(lastSaved).toLocaleDateString()
    const displayed = expanded ? entries : entries.slice(0, PREVIEW_COUNT)

    return (
      <div className={cn(
        'rounded-md border border-border',
        'bg-card backdrop-blur-xl overflow-hidden',
        'transition-[border-color,box-shadow] hover:border-border/60',
        '[&]:before:absolute [&]:before:inset-x-0 [&]:before:top-0 [&]:before:h-px',
        '[&]:before:bg-gradient-to-r [&]:before:from-transparent [&]:before:via-white/8 [&]:before:to-transparent',
        'relative',
      )}>
        {/* Header */}
        <div className="flex items-center gap-3 p-4">
          <div className="size-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-base shrink-0">
            📺
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{lessonTitle}</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {entries.length} words · saved {lastSavedDate}
            </div>
          </div>
          <Button onClick={() => navigate(`/vocabulary/${lessonId}/study`)}>
            Study
          </Button>
        </div>

        {/* Word grid */}
        {entries.length > 0 && (
          <>
            <div
              className="grid border-t border-border"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1px', background: 'hsl(var(--border))' }}
            >
              {displayed.map(entry => (
                <WordCard key={entry.id} entry={entry} />
              ))}
            </div>
            {entries.length > PREVIEW_COUNT && (
              <button
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 border-t border-border transition-colors"
                onClick={() => setExpanded(e => !e)}
              >
                {expanded ? 'Show less ↑' : `Show all ${entries.length} words ↓`}
              </button>
            )}
          </>
        )}
      </div>
    )
  }
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/workbook/LessonGroup.tsx
  git commit -m "feat: add LessonGroup card with expand/collapse word preview"
  ```

---

### Task 10: `WorkbookPage`

**Files:**
- Create: `frontend/src/pages/WorkbookPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

- [ ] **Implement `WorkbookPage`**

  Create `frontend/src/pages/WorkbookPage.tsx`:

  ```tsx
  import { useMemo, useState } from 'react'
  import { Layout } from '@/components/Layout'
  import { LessonGroup } from '@/components/workbook/LessonGroup'
  import { useVocabulary } from '@/hooks/useVocabulary'
  import { Input } from '@/components/ui/input'

  export function WorkbookPage() {
    const { entries, entriesByLesson } = useVocabulary()
    const [search, setSearch] = useState('')

    const lastSaved = entries.length
      ? entries.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
      : null

    // Sort lesson groups by most recently saved entry
    const sortedLessonIds = useMemo(() => {
      return Object.keys(entriesByLesson).sort((a, b) => {
        const latestA = entriesByLesson[a].reduce((x, e) => (e.createdAt > x ? e.createdAt : x), '')
        const latestB = entriesByLesson[b].reduce((x, e) => (e.createdAt > x ? e.createdAt : x), '')
        return latestB.localeCompare(latestA)
      })
    }, [entriesByLesson])

    // Filter entries by search
    const filteredByLesson = useMemo(() => {
      if (!search.trim()) return entriesByLesson
      const q = search.toLowerCase()
      const result: Record<string, typeof entries> = {}
      for (const [lid, group] of Object.entries(entriesByLesson)) {
        const filtered = group.filter(e =>
          e.word.includes(q) || e.meaning.toLowerCase().includes(q) || e.pinyin.includes(q),
        )
        if (filtered.length > 0) result[lid] = filtered
      }
      return result
    }, [entriesByLesson, search])

    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-9 pb-20">
          {/* Header */}
          <div className="flex items-end justify-between mb-7">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Workbook</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {entries.length} words · {sortedLessonIds.length} lessons
              </p>
            </div>
            <Input
              className="w-48"
              placeholder="Search words…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-7">
            {[
              { value: entries.length, label: 'Words saved' },
              { value: sortedLessonIds.length, label: 'Lessons' },
              { value: lastSaved ? new Date(lastSaved).toLocaleDateString() : '—', label: 'Last saved' },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-border bg-card backdrop-blur-xl p-4">
                <div className="text-xl font-bold">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Groups */}
          {sortedLessonIds.length === 0 && (
            <div className="text-center py-20 text-muted-foreground text-sm">
              No words saved yet. Open a lesson and tap the bookmark icon on any word.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {sortedLessonIds
              .filter(id => filteredByLesson[id])
              .map(id => (
                <LessonGroup
                  key={id}
                  lessonId={id}
                  lessonTitle={filteredByLesson[id][0].sourceLessonTitle}
                  entries={filteredByLesson[id]}
                />
              ))}
          </div>
        </div>
      </Layout>
    )
  }
  ```

- [ ] **Add route in `App.tsx`**

  Import `WorkbookPage` and add:
  ```tsx
  <Route path="/vocabulary" element={<WorkbookPage />} />
  <Route path="/vocabulary/:lessonId/study" element={<StudySessionPage />} />
  ```
  (Add `StudySessionPage` import as a placeholder — it will be created in Chunk 5.)

- [ ] **Type-check and verify no import errors**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/pages/WorkbookPage.tsx frontend/src/App.tsx
  git commit -m "feat: add WorkbookPage with lesson groups, stats, and search"
  ```

---

## Chunk 4: Client-side Study Exercises

### Task 11: `ModePicker` + `ProgressBar`

**Files:**
- Create: `frontend/src/components/study/ModePicker.tsx`
- Create: `frontend/src/components/study/ProgressBar.tsx`

- [ ] **Create `ProgressBar`**

  ```tsx
  // frontend/src/components/study/ProgressBar.tsx
  interface ProgressBarProps { current: number; total: number }

  export function ProgressBar({ current, total }: ProgressBarProps) {
    const pct = total > 0 ? (current / total) * 100 : 0
    return (
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground/60 rounded-full transition-all duration-400"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{current} / {total}</span>
      </div>
    )
  }
  ```

- [ ] **Create `ModePicker`**

  ```tsx
  // frontend/src/components/study/ModePicker.tsx
  import { Button } from '@/components/ui/button'
  import { cn } from '@/lib/utils'

  export type ExerciseMode = 'cloze' | 'dictation' | 'pinyin' | 'pronunciation' | 'reconstruction' | 'mixed'

  const MODES: { id: ExerciseMode; icon: string; name: string; desc: string }[] = [
    { id: 'cloze',          icon: '✍️', name: 'Cloze',        desc: 'Fill blanks in a story' },
    { id: 'dictation',      icon: '🎧', name: 'Dictation',    desc: 'Hear it, type it' },
    { id: 'pinyin',         icon: '🔤', name: 'Pinyin',       desc: 'See char, type pinyin' },
    { id: 'pronunciation',  icon: '🎤', name: 'Speak',        desc: 'Pronounce & score' },
    { id: 'reconstruction', icon: '🔀', name: 'Rebuild',      desc: 'Unscramble sentence' },
  ]

  interface ModePickerProps {
    selected: ExerciseMode
    onSelect: (mode: ExerciseMode) => void
    count: number
    onCountChange: (n: number) => void
    onStart: () => void
    lessonTitle: string
  }

  export function ModePicker({ selected, onSelect, count, onCountChange, onStart, lessonTitle }: ModePickerProps) {
    return (
      <div>
        <h2 className="text-xl font-bold tracking-tight">Start a Study Session</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-8">{lessonTitle}</p>

        <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-3">Exercise type</p>

        {/* 3×2 grid */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={cn(
                'py-3.5 px-2.5 rounded-md text-center border transition-all',
                selected === m.id
                  ? 'bg-accent border-border/60 shadow-sm'
                  : 'bg-secondary border-border hover:bg-accent/60',
              )}
            >
              <span className="text-xl block mb-1.5">{m.icon}</span>
              <div className="text-sm font-semibold">{m.name}</div>
              <div className="text-sm text-muted-foreground mt-0.5 leading-tight">{m.desc}</div>
            </button>
          ))}
          {/* placeholder for symmetry */}
          <div className="rounded-md border border-border/30 bg-secondary/20 flex items-center justify-center text-sm text-muted-foreground/30">
            More soon
          </div>
        </div>

        {/* Mixed — full width */}
        <button
          onClick={() => onSelect('mixed')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-md border transition-all text-left',
            selected === 'mixed'
              ? 'bg-accent border-border/60 shadow-sm'
              : 'bg-secondary border-border hover:bg-accent/60',
          )}
        >
          <span className="text-lg shrink-0">✍️🎧🎤</span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Mixed Practice</div>
            <div className="text-sm text-muted-foreground mt-0.5">All types shuffled together</div>
          </div>
          <span className="text-sm font-semibold border border-border rounded-full px-2.5 py-1 text-muted-foreground">
            Recommended
          </span>
        </button>

        {/* Question count */}
        <div className="flex items-center justify-between mt-2 px-4 py-3 rounded-md bg-secondary border border-border">
          <span className="text-sm text-muted-foreground">Questions</span>
          <div className="flex items-center gap-3">
            <button
              className="size-7 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors"
              onClick={() => onCountChange(Math.max(5, count - 1))}
            >−</button>
            <span className="text-base font-bold w-6 text-center">{count}</span>
            <button
              className="size-7 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors"
              onClick={() => onCountChange(Math.min(20, count + 1))}
            >+</button>
          </div>
        </div>

        <Button className="w-full mt-4" onClick={onStart}>
          Start session →
        </Button>
      </div>
    )
  }
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/study/ModePicker.tsx frontend/src/components/study/ProgressBar.tsx
  git commit -m "feat: add ModePicker and ProgressBar study session components"
  ```

---

### Task 12: `PinyinRecallExercise`

**Files:**
- Create: `frontend/src/components/study/exercises/PinyinRecallExercise.tsx`
- Test: `frontend/tests/PinyinRecallExercise.test.tsx`

- [ ] **Write failing test**

  ```typescript
  // frontend/tests/PinyinRecallExercise.test.tsx
  import { render, screen, fireEvent } from '@testing-library/react'
  import { PinyinRecallExercise } from '@/components/study/exercises/PinyinRecallExercise'
  import type { VocabEntry } from '@/types'

  const entry: VocabEntry = {
    id: '1', word: '今天', pinyin: 'jīntiān', meaning: 'today', usage: '',
    sourceLessonId: 'l1', sourceLessonTitle: '', sourceSegmentId: 's1',
    sourceSegmentChinese: '', sourceSegmentTranslation: '', createdAt: '',
  }

  it('shows correct feedback on matching pinyin', () => {
    render(<PinyinRecallExercise entry={entry} onNext={vi.fn()} playTTS={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/pinyin/i), { target: { value: 'jin1tian1' } })
    fireEvent.click(screen.getByRole('button', { name: /check/i }))
    expect(screen.getByText(/correct/i)).toBeInTheDocument()
  })

  it('shows wrong feedback on mismatched pinyin', () => {
    render(<PinyinRecallExercise entry={entry} onNext={vi.fn()} playTTS={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/pinyin/i), { target: { value: 'jin2tian1' } })
    fireEvent.click(screen.getByRole('button', { name: /check/i }))
    expect(screen.getByText(/incorrect/i)).toBeInTheDocument()
  })
  ```

- [ ] **Run to verify failure**

  ```bash
  cd frontend && npx vitest run tests/PinyinRecallExercise.test.tsx 2>&1 | tail -10
  ```

- [ ] **Implement `PinyinRecallExercise`**

  ```tsx
  // frontend/src/components/study/exercises/PinyinRecallExercise.tsx
  import { useState } from 'react'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { comparePinyin } from '@/lib/pinyin-utils'
  import type { VocabEntry } from '@/types'
  import { cn } from '@/lib/utils'

  interface Props {
    entry: VocabEntry
    onNext: (correct: boolean) => void
    playTTS: (text: string) => Promise<void>
  }

  export function PinyinRecallExercise({ entry, onNext, playTTS }: Props) {
    const [value, setValue] = useState('')
    const [checked, setChecked] = useState(false)
    const correct = comparePinyin(value, entry.pinyin)

    function handleCheck() {
      if (!value.trim()) return
      setChecked(true)
      if (correct) playTTS(entry.word)
    }

    return (
      <div className="rounded-md border border-border bg-card backdrop-blur-xl p-6">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-5">
          🔤 Pinyin Recall
        </span>

        <div className="text-center py-5 pb-4">
          <span className="text-5xl font-bold tracking-widest">{entry.word}</span>
          <p className="text-sm text-muted-foreground mt-2.5">{entry.meaning}</p>
        </div>

        <Input
          className="text-center text-sm mb-2"
          placeholder="Type pinyin with tones, e.g. jīntiān or jin1tian1…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !checked && handleCheck()}
          disabled={checked}
        />
        <p className="text-sm text-muted-foreground/50 text-center mb-4">Accepts tone marks or tone numbers</p>

        {checked && (
          <div className={cn(
            'rounded-md border px-4 py-3 mb-4 text-sm',
            correct
              ? 'bg-green-500/10 border-green-500/25 text-green-400'
              : 'bg-red-500/10 border-red-500/25 text-red-400',
          )}>
            {correct ? '✓ Correct!' : `✗ Incorrect — ${entry.pinyin}`}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <button className="text-sm text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => onNext(false)}>
            Skip
          </button>
          {!checked
            ? <Button onClick={handleCheck}>Check →</Button>
            : <Button onClick={() => onNext(correct)}>Next →</Button>
          }
        </div>
      </div>
    )
  }
  ```

- [ ] **Run tests**

  ```bash
  cd frontend && npx vitest run tests/PinyinRecallExercise.test.tsx 2>&1 | tail -10
  ```

  Expected: PASS.

- [ ] **Commit**

  ```bash
  git add frontend/src/components/study/exercises/PinyinRecallExercise.tsx frontend/tests/PinyinRecallExercise.test.tsx
  git commit -m "feat: add PinyinRecallExercise with tone mark/number comparison"
  ```

---

### Task 13: `DictationExercise`

**Files:**
- Create: `frontend/src/components/study/exercises/DictationExercise.tsx`

- [ ] **Implement `DictationExercise`**

  ```tsx
  // frontend/src/components/study/exercises/DictationExercise.tsx
  import { useState } from 'react'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import type { VocabEntry } from '@/types'
  import { cn } from '@/lib/utils'

  interface Props {
    entry: VocabEntry
    onNext: (correct: boolean) => void
    playTTS: (text: string) => Promise<void>
  }

  export function DictationExercise({ entry, onNext, playTTS }: Props) {
    const [value, setValue] = useState('')
    const [checked, setChecked] = useState(false)
    const [pinyinMode, setPinyinMode] = useState(false)
    const expected = pinyinMode ? entry.pinyin : entry.sourceSegmentChinese
    const correct = value.trim() === expected.trim()

    return (
      <div className="rounded-md border border-border bg-card backdrop-blur-xl p-6">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-5">
          🎧 Dictation
        </span>

        <p className="text-sm text-muted-foreground mb-5">Listen carefully and type what you hear in Chinese.</p>

        <button
          className="flex flex-col items-center gap-1.5 mx-auto mb-5 size-16 rounded-full border border-border bg-secondary hover:bg-accent transition-colors justify-center text-2xl"
          onClick={() => playTTS(entry.sourceSegmentChinese)}
        >
          🔊
        </button>

        <Input
          className="mb-3"
          placeholder={pinyinMode ? 'Type pinyin…' : 'Type what you heard…'}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
          disabled={checked}
        />

        {checked && (
          <div className={cn(
            'rounded-md border px-4 py-3 mb-4 text-sm',
            correct
              ? 'bg-green-500/10 border-green-500/25 text-green-400'
              : 'bg-red-500/10 border-red-500/25 text-red-400',
          )}>
            {correct ? '✓ Correct!' : `✗ — ${expected}`}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <button className="text-sm text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => onNext(false)}>
              Skip
            </button>
            <button
              className="text-sm text-muted-foreground/50 hover:text-muted-foreground px-2 py-1 border border-border/40 rounded"
              onClick={() => setPinyinMode(m => !m)}
            >
              {pinyinMode ? 'Switch to characters' : 'Switch to pinyin'}
            </button>
          </div>
          {!checked
            ? <Button onClick={() => setChecked(true)}>Check →</Button>
            : <Button onClick={() => onNext(correct)}>Next →</Button>
          }
        </div>
      </div>
    )
  }
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/study/exercises/DictationExercise.tsx
  git commit -m "feat: add DictationExercise with TTS playback and pinyin mode toggle"
  ```

---

### Task 14: `ReconstructionExercise`

**Files:**
- Create: `frontend/src/components/study/exercises/ReconstructionExercise.tsx`
- Test: `frontend/tests/ReconstructionExercise.test.ts`

- [ ] **Write failing tests for the chip-dimming utility**

  ```typescript
  // frontend/tests/ReconstructionExercise.test.ts
  import { describe, it, expect } from 'vitest'
  import { getActiveChips } from '@/components/study/exercises/ReconstructionExercise'

  describe('getActiveChips', () => {
    it('dims chips whose word appears in typed text', () => {
      const chips = ['今天', '非常', '好']
      const typed = '今天非常'
      const result = getActiveChips(chips, typed)
      expect(result).toEqual([false, false, true])  // false = dimmed
    })
    it('does not dim unmatched chips', () => {
      const result = getActiveChips(['今天'], '')
      expect(result).toEqual([true])
    })
  })
  ```

- [ ] **Run to verify failure**

  ```bash
  cd frontend && npx vitest run tests/ReconstructionExercise.test.ts 2>&1 | tail -10
  ```

- [ ] **Implement `ReconstructionExercise`**

  ```tsx
  // frontend/src/components/study/exercises/ReconstructionExercise.tsx
  import { useState, useMemo } from 'react'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import type { VocabEntry } from '@/types'
  import { cn } from '@/lib/utils'
  import { Link } from 'react-router-dom'

  /** Returns true if chip should remain visible (not yet typed) */
  export function getActiveChips(chips: string[], typed: string): boolean[] {
    return chips.map(chip => !typed.includes(chip))
  }

  function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function charDiff(typed: string, expected: string): { char: string; ok: boolean }[] {
    return expected.split('').map((ch, i) => ({ char: ch, ok: typed[i] === ch }))
  }

  interface Props {
    entry: VocabEntry
    words: string[]   // token words from Segment.words filtered to appear in sourceSegmentChinese
    onNext: (correct: boolean) => void
  }

  export function ReconstructionExercise({ entry, words, onNext }: Props) {
    const chips = useMemo(() => shuffleArray(words), [words])
    const [value, setValue] = useState('')
    const [checked, setChecked] = useState(false)
    const active = getActiveChips(chips, value)
    const correct = value.trim() === entry.sourceSegmentChinese.trim()
    const diff = checked ? charDiff(value, entry.sourceSegmentChinese) : null

    return (
      <div className="rounded-md border border-border bg-card backdrop-blur-xl p-6">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-4">
          🔀 Sentence Reconstruction
        </span>

        <Link
          to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground border border-border/50 rounded-full px-2.5 py-1 mb-4 hover:text-foreground transition-colors"
        >
          📍 {entry.sourceLessonTitle} — where you saved {entry.word}
        </Link>

        <p className="text-sm text-muted-foreground mb-4">Type the words in correct order.</p>

        {/* Chip hints */}
        <div className="flex flex-wrap gap-2 mb-4">
          {chips.map((chip, i) => (
            <span
              key={i}
              className={cn(
                'px-3 py-1.5 rounded-md text-base font-semibold border border-border bg-secondary transition-opacity',
                !active[i] && 'opacity-25 pointer-events-none',
              )}
            >
              {chip}
            </span>
          ))}
        </div>

        <Input
          className="text-base tracking-wide mb-0"
          placeholder="Type the sentence…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
          disabled={checked}
        />

        {diff && (
          <div className="mt-3 px-3 py-2 rounded-md bg-secondary/40 text-lg font-bold tracking-wider">
            {diff.map((d, i) => (
              <span key={i} className={d.ok ? 'text-green-400' : 'text-red-400'}>{d.char}</span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center mt-4">
          <button className="text-sm text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => onNext(false)}>
            Skip
          </button>
          {!checked
            ? <Button onClick={() => setChecked(true)}>Check →</Button>
            : <Button onClick={() => onNext(correct)}>Next →</Button>
          }
        </div>
      </div>
    )
  }
  ```

- [ ] **Run tests**

  ```bash
  cd frontend && npx vitest run tests/ReconstructionExercise.test.ts 2>&1 | tail -10
  ```

  Expected: PASS.

- [ ] **Commit**

  ```bash
  git add frontend/src/components/study/exercises/ReconstructionExercise.tsx frontend/tests/ReconstructionExercise.test.ts
  git commit -m "feat: add ReconstructionExercise with chip hints and char-by-char diff"
  ```

---

### Task 15: `SessionSummary`

**Files:**
- Create: `frontend/src/components/study/SessionSummary.tsx`

- [ ] **Implement `SessionSummary`**

  ```tsx
  // frontend/src/components/study/SessionSummary.tsx
  import { Button } from '@/components/ui/button'
  import type { VocabEntry } from '@/types'

  interface Result { entry: VocabEntry; correct: boolean }

  interface Props {
    results: Result[]
    onStudyAgain: () => void
    onBack: () => void
  }

  export function SessionSummary({ results, onStudyAgain, onBack }: Props) {
    const correct = results.filter(r => r.correct).length
    const wrong = results.filter(r => !r.correct).map(r => r.entry)

    return (
      <div className="rounded-md border border-border bg-card backdrop-blur-xl p-8 text-center">
        <div className="text-4xl mb-2">{correct === results.length ? '🎉' : '💪'}</div>
        <div className="text-4xl font-bold tracking-tight">{correct} / {results.length}</div>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          {correct === results.length ? 'Perfect session!' : `${wrong.length} word${wrong.length !== 1 ? 's' : ''} to revisit.`}
        </p>

        {wrong.length > 0 && (
          <div className="rounded-md border border-red-500/20 bg-red-500/8 px-4 py-3 mb-6 text-left">
            <p className="text-sm font-semibold tracking-widest text-red-400 uppercase mb-2">Review these</p>
            {wrong.map(e => (
              <div key={e.id} className="flex items-center gap-3 mb-1">
                <span className="text-lg font-bold text-red-300">{e.word}</span>
                <div>
                  <div className="text-sm text-foreground">{e.pinyin} · {e.meaning}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack}>Back to Workbook</Button>
          <Button className="flex-1" onClick={onStudyAgain}>Study again</Button>
        </div>
      </div>
    )
  }
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/study/SessionSummary.tsx
  git commit -m "feat: add SessionSummary with score and words-to-review list"
  ```

---

## Chunk 5: Backend API

### Task 16: `/api/quiz/generate` endpoint

**Files:**
- Create: `backend/app/routers/quiz.py`
- Modify: `backend/app/main.py`

- [ ] **Create `backend/app/routers/quiz.py`**

  ```python
  # backend/app/routers/quiz.py
  import re
  import httpx
  from fastapi import APIRouter
  from pydantic import BaseModel

  from app.config import settings

  router = APIRouter(prefix="/api/quiz", tags=["quiz"])


  class WordInput(BaseModel):
      word: str
      pinyin: str
      meaning: str
      usage: str


  class QuizRequest(BaseModel):
      openai_api_key: str
      words: list[WordInput]
      exercise_type: str  # "cloze" | "pronunciation_sentence"
      story_count: int = 1
      count: int = 5


  class ClozeExercise(BaseModel):
      story: str
      blanks: list[str]


  class PronunciationExercise(BaseModel):
      sentence: str
      translation: str


  class QuizResponse(BaseModel):
      exercises: list[ClozeExercise | PronunciationExercise]


  def _build_cloze_prompt(words: list[WordInput], story_count: int) -> str:
      word_list = "\n".join(f"- {w.word} ({w.pinyin}): {w.meaning}" for w in words[:5])
      return (
          f"Generate {story_count} short cohesive Chinese story(ies) using these vocabulary words:\n"
          f"{word_list}\n\n"
          "Rules:\n"
          "- Each story should be 2-3 sentences, using up to 5 of these words naturally.\n"
          "- Mark each vocabulary word occurrence with {{word}}, e.g. {{今天}}.\n"
          "- Return JSON: {\"exercises\": [{\"story\": \"...\", \"blanks\": [\"word1\", \"word2\"]}]}\n"
          "- Only return valid JSON, no markdown fences."
      )


  def _build_pronunciation_prompt(words: list[WordInput], count: int) -> str:
      word_list = "\n".join(f"- {w.word} ({w.pinyin}): {w.meaning}" for w in words)
      return (
          f"Generate {count} short, natural Chinese sentences for pronunciation practice "
          f"using these vocabulary words:\n{word_list}\n\n"
          "Rules:\n"
          "- Each sentence should incorporate at least one vocabulary word.\n"
          "- Include pinyin and English translation.\n"
          "- Return JSON: {\"exercises\": [{\"sentence\": \"中文\", \"translation\": \"English\"}]}\n"
          "- Only return valid JSON, no markdown fences."
      )


  @router.post("/generate", response_model=QuizResponse)
  async def generate_quiz(req: QuizRequest):
      if req.exercise_type == "cloze":
          prompt = _build_cloze_prompt(req.words, req.story_count)
      elif req.exercise_type == "pronunciation_sentence":
          prompt = _build_pronunciation_prompt(req.words, req.count)
      else:
          raise ValueError(f"Unknown exercise_type: {req.exercise_type}")

      payload = {
          "model": "openai/gpt-4o-mini",
          "messages": [
              {"role": "system", "content": "You are a Mandarin Chinese teacher creating learning exercises."},
              {"role": "user", "content": prompt},
          ],
          "temperature": 0.7,
      }

      async with httpx.AsyncClient(timeout=30) as client:
          resp = await client.post(
              settings.openai_chat_url,
              headers={"Authorization": f"Bearer {req.openai_api_key}"},
              json=payload,
          )
          resp.raise_for_status()

      content = resp.json()["choices"][0]["message"]["content"]
      # Strip any markdown fences just in case
      content = re.sub(r"```(?:json)?\s*|\s*```", "", content).strip()

      import json
      data = json.loads(content)
      return QuizResponse(**data)
  ```

- [ ] **Register in `backend/app/main.py`**

  ```python
  from app.routers import chat, jobs, lessons, tts, quiz
  # ...
  app.include_router(quiz.router)
  ```

- [ ] **Test the endpoint manually with curl** (requires a running server):

  ```bash
  # Start the server in one terminal:
  cd backend && uvicorn app.main:app --reload

  # In another terminal:
  curl -s -X POST http://localhost:8000/api/quiz/generate \
    -H 'Content-Type: application/json' \
    -d '{
      "openai_api_key": "YOUR_KEY",
      "words": [{"word":"今天","pinyin":"jīntiān","meaning":"today","usage":"今天很好"}],
      "exercise_type": "cloze",
      "story_count": 1
    }' | python3 -m json.tool
  ```

  Expected: JSON with `exercises` array containing `story` and `blanks` fields.

- [ ] **Commit**

  ```bash
  git add backend/app/routers/quiz.py backend/app/main.py
  git commit -m "feat: add /api/quiz/generate endpoint for cloze and pronunciation sentences"
  ```

---

### Task 17: `/api/pronunciation/assess` endpoint

**Files:**
- Create: `backend/app/routers/pronunciation.py`
- Modify: `backend/app/main.py`
- Modify: `backend/requirements.txt`

- [ ] **Verify Azure SDK system dependencies in Docker**

  ```bash
  # Run in a container to check:
  docker compose run --rm backend bash -c \
    "dpkg -l | grep -E 'libssl|libasound' || echo 'MISSING'"
  ```

  If "MISSING" is printed for either library, add to the backend `Dockerfile`:
  ```dockerfile
  RUN apt-get update && apt-get install -y libssl-dev libasound2 && rm -rf /var/lib/apt/lists/*
  ```

- [ ] **Add Azure SDK to requirements**

  In `backend/requirements.txt`, add:
  ```
  azure-cognitiveservices-speech
  ```

  Install locally to verify:
  ```bash
  cd backend && pip install azure-cognitiveservices-speech
  ```

- [ ] **Create `backend/app/routers/pronunciation.py`**

  ```python
  # backend/app/routers/pronunciation.py
  import subprocess
  import tempfile
  from pathlib import Path

  from fastapi import APIRouter, Form, HTTPException, UploadFile
  from pydantic import BaseModel

  router = APIRouter(prefix="/api/pronunciation", tags=["pronunciation"])


  class WordScore(BaseModel):
      word: str
      accuracy: float
      error_type: str | None
      error_detail: str | None


  class OverallScore(BaseModel):
      accuracy: float
      fluency: float
      completeness: float
      prosody: float


  class PronunciationResult(BaseModel):
      overall: OverallScore
      words: list[WordScore]


  @router.post("/assess", response_model=PronunciationResult)
  async def assess_pronunciation(
      audio: UploadFile,
      reference_text: str = Form(...),
      language: str = Form("zh-CN"),
      azure_key: str = Form(...),
      azure_region: str = Form("eastus"),
  ):
      try:
          import azure.cognitiveservices.speech as speechsdk
      except ImportError:
          raise HTTPException(503, "Azure Speech SDK not installed")

      with tempfile.TemporaryDirectory() as tmp:
          webm_path = Path(tmp) / "input.webm"
          wav_path = Path(tmp) / "output.wav"

          # Save uploaded audio
          webm_path.write_bytes(await audio.read())

          # Transcode WebM → 16kHz mono WAV
          result = subprocess.run(
              ["ffmpeg", "-y", "-i", str(webm_path),
               "-ar", "16000", "-ac", "1", "-f", "wav", str(wav_path)],
              capture_output=True, timeout=30,
          )
          if result.returncode != 0:
              raise HTTPException(500, f"ffmpeg failed: {result.stderr.decode()}")

          # Configure Azure pronunciation assessment
          speech_config = speechsdk.SpeechConfig(
              subscription=azure_key, region=azure_region
          )
          audio_config = speechsdk.AudioConfig(filename=str(wav_path))
          pronunciation_config = speechsdk.PronunciationAssessmentConfig(
              reference_text=reference_text,
              grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
              granularity=speechsdk.PronunciationAssessmentGranularity.Word,
              enable_miscue=True,
          )
          pronunciation_config.enable_prosody_assessment()

          recognizer = speechsdk.SpeechRecognizer(
              speech_config=speech_config,
              audio_config=audio_config,
              language=language,
          )
          pronunciation_config.apply_to(recognizer)

          ev = recognizer.recognize_once()

          if ev.reason != speechsdk.ResultReason.RecognizedSpeech:
              raise HTTPException(422, "Speech not recognized — try speaking more clearly")

          pa_result = speechsdk.PronunciationAssessmentResult(ev)

          overall = OverallScore(
              accuracy=pa_result.accuracy_score,
              fluency=pa_result.fluency_score,
              completeness=pa_result.completeness_score,
              prosody=pa_result.prosody_score,
          )

          words = []
          for w in pa_result.words:
              error_type = w.error_type if w.error_type != "None" else None
              words.append(WordScore(
                  word=w.word,
                  accuracy=w.accuracy_score,
                  error_type=error_type,
                  error_detail=f"{w.word} — check pronunciation" if error_type else None,
              ))

          return PronunciationResult(overall=overall, words=words)
  ```

- [ ] **Register in `backend/app/main.py`**

  ```python
  from app.routers import chat, jobs, lessons, tts, quiz, pronunciation
  # ...
  app.include_router(pronunciation.router)
  ```

- [ ] **Test endpoint with curl** (requires valid Azure credentials):

  ```bash
  curl -X POST http://localhost:8000/api/pronunciation/assess \
    -F "audio=@/path/to/test.webm" \
    -F "reference_text=今天天气很好" \
    -F "language=zh-CN" \
    -F "azure_key=YOUR_KEY" \
    -F "azure_region=eastus"
  ```

  Expected: JSON with `overall` scores and `words` array.

- [ ] **Commit**

  ```bash
  git add backend/app/routers/pronunciation.py backend/app/main.py backend/requirements.txt
  git commit -m "feat: add /api/pronunciation/assess with ffmpeg transcoding and Azure SDK"
  ```

---

## Chunk 6: AI-Backed Exercises + StudySessionPage

### Task 18: `ClozeExercise`

**Files:**
- Create: `frontend/src/components/study/exercises/ClozeExercise.tsx`

- [ ] **Implement `ClozeExercise`**

  ```tsx
  // frontend/src/components/study/exercises/ClozeExercise.tsx
  import { useEffect, useRef, useState } from 'react'
  import { Button } from '@/components/ui/button'
  import { Link } from 'react-router-dom'
  import type { VocabEntry } from '@/types'
  import { cn } from '@/lib/utils'

  interface ClozeQuestion {
    story: string    // "小明说{{今天}}他要去..."
    blanks: string[] // ["今天", "非常"]
  }

  interface Props {
    question: ClozeQuestion
    entries: VocabEntry[]
    onNext: (correct: boolean) => void
  }

  // Parse story into parts: [{text: "小明说", blank: null}, {text: "", blank: "今天"}, ...]
  function parseStory(story: string): { text: string; blank: string | null }[] {
    const parts: { text: string; blank: string | null }[] = []
    const regex = /\{\{([^}]+)\}\}/g
    let last = 0; let m
    while ((m = regex.exec(story)) !== null) {
      if (m.index > last) parts.push({ text: story.slice(last, m.index), blank: null })
      parts.push({ text: '', blank: m[1] })
      last = m.index + m[0].length
    }
    if (last < story.length) parts.push({ text: story.slice(last), blank: null })
    return parts
  }

  export function ClozeExercise({ question, entries, onNext }: Props) {
    const parts = parseStory(question.story)
    const [answers, setAnswers] = useState<Record<number, string>>({})
    const [checked, setChecked] = useState(false)
    const firstInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => { firstInputRef.current?.focus() }, [])

    let blankIdx = 0
    const blankIndices: number[] = []
    parts.forEach((p, i) => { if (p.blank) blankIndices.push(i) })

    const allCorrect = blankIndices.every(i => answers[i]?.trim() === parts[i].blank)

    function findEntry(blank: string) {
      return entries.find(e => e.word === blank)
    }

    return (
      <div className="rounded-md border border-border bg-card backdrop-blur-xl p-6">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-5">
          ✍️ Scenario Cloze · AI Generated
        </span>

        {/* Story with inline inputs */}
        <div className="text-base leading-[2.2] bg-secondary/40 border border-border rounded-md px-5 py-4 mb-4">
          {parts.map((part, i) => {
            if (!part.blank) return <span key={i}>{part.text}</span>
            const idx = blankIdx++
            const correct = answers[i]?.trim() === part.blank
            return (
              <input
                key={i}
                ref={idx === 0 ? firstInputRef : undefined}
                className={cn(
                  'inline-block w-16 text-center text-sm border rounded px-1 py-0.5 mx-0.5 outline-none transition-colors bg-card',
                  checked
                    ? correct
                      ? 'border-green-500/50 text-green-400 bg-green-500/8'
                      : 'border-red-500/50 text-red-400 bg-red-500/8'
                    : 'border-border focus:border-foreground/30',
                )}
                value={answers[i] ?? ''}
                onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
                disabled={checked}
                placeholder="…"
              />
            )
          })}
        </div>

        {/* Feedback per blank */}
        {checked && blankIndices.map(i => {
          const blank = parts[i].blank!
          const entry = findEntry(blank)
          const correct = answers[i]?.trim() === blank
          return (
            <div key={i} className={cn(
              'rounded-md border px-4 py-3 mb-2 text-sm flex items-start gap-3',
              correct
                ? 'bg-green-500/8 border-green-500/20 text-green-400'
                : 'bg-red-500/8 border-red-500/20 text-red-400',
            )}>
              <span>{correct ? '✓' : '✗'}</span>
              <div>
                <span className="font-semibold">{blank}</span> — {correct ? 'correct!' : `expected "${blank}"`}
                {entry && (
                  <Link
                    to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
                    className="block text-sm mt-0.5 opacity-60 hover:opacity-100"
                  >
                    📍 View in video →
                  </Link>
                )}
              </div>
            </div>
          )
        })}

        <div className="flex items-center justify-center mt-4">
          <button className="text-sm text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => onNext(false)}>
            Skip
          </button>
          {!checked
            ? <Button onClick={() => setChecked(true)}>Check →</Button>
            : <Button onClick={() => onNext(allCorrect)}>Next →</Button>
          }
        </div>
      </div>
    )
  }
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/study/exercises/ClozeExercise.tsx
  git commit -m "feat: add ClozeExercise with inline blank inputs and source deep-links"
  ```

---

### Task 19: `PronunciationReferee`

**Files:**
- Create: `frontend/src/components/study/exercises/PronunciationReferee.tsx`

- [ ] **Implement `PronunciationReferee`**

  ```tsx
  // frontend/src/components/study/exercises/PronunciationReferee.tsx
  import { useRef, useState } from 'react'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/lib/utils'

  interface PronunciationSentence { sentence: string; translation: string }

  interface Props {
    sentence: PronunciationSentence
    apiBaseUrl: string
    azureKey: string
    azureRegion: string
    onNext: (correct: boolean) => void
  }

  type RecordingState = 'idle' | 'recording' | 'stopped'

  interface WordScore { word: string; accuracy: number; error_type: string | null; error_detail: string | null }
  interface AssessResult { overall: { accuracy: number; fluency: number; completeness: number; prosody: number }; words: WordScore[] }

  function scoreColor(n: number) {
    if (n >= 80) return 'text-green-400'
    if (n >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  export function PronunciationReferee({ sentence, apiBaseUrl, azureKey, azureRegion, onNext }: Props) {
    const [state, setState] = useState<RecordingState>('idle')
    const [attempt, setAttempt] = useState(0)
    const [blob, setBlob] = useState<Blob | null>(null)
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
    const [result, setResult] = useState<AssessResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const mediaRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])

    async function startRecording() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        const b = new Blob(chunksRef.current, { type: 'audio/webm' })
        setBlob(b)
        if (playbackUrl) URL.revokeObjectURL(playbackUrl)
        setPlaybackUrl(URL.createObjectURL(b))
        stream.getTracks().forEach(t => t.stop())
      }
      recorder.start()
      mediaRef.current = recorder
      setState('recording')
      setAttempt(a => a + 1)
      setResult(null)
      setError(null)
    }

    function stopRecording() {
      mediaRef.current?.stop()
      setState('stopped')
    }

    async function handleSubmit() {
      if (!blob) return
      setSubmitting(true)
      setError(null)
      try {
        const form = new FormData()
        form.append('audio', blob, 'recording.webm')
        form.append('reference_text', sentence.sentence)
        form.append('language', 'zh-CN')
        form.append('azure_key', azureKey)
        form.append('azure_region', azureRegion)
        const resp = await fetch(`${apiBaseUrl}/api/pronunciation/assess`, { method: 'POST', body: form })
        if (!resp.ok) throw new Error(await resp.text())
        setResult(await resp.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Assessment failed')
      } finally {
        setSubmitting(false)
      }
    }

    const waveBarCount = 10

    return (
      <div className="rounded-md border border-border bg-card backdrop-blur-xl p-6">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-5">
          🎤 Pronunciation Referee · Azure Scored
        </span>

        <p className="text-sm text-muted-foreground mb-4">
          Record as many times as you like. Listen back before submitting.
        </p>

        {/* Sentence display */}
        <div className="bg-secondary/40 border border-border rounded-md p-4 text-center mb-5">
          <div className="text-xl font-bold tracking-widest">{sentence.sentence}</div>
          <div className="text-sm text-muted-foreground mt-1.5">{sentence.translation}</div>
        </div>

        {/* Waveform */}
        <div className="h-10 bg-secondary/40 border border-border rounded-md flex items-center justify-center gap-1 px-4 mb-3 overflow-hidden">
          {Array.from({ length: waveBarCount }, (_, i) => (
            <div
              key={i}
              className={cn(
                'w-0.5 rounded-full bg-foreground/50',
                state === 'recording' ? 'animate-[wave_1.3s_ease-in-out_infinite]' : '',
              )}
              style={{
                height: state === 'recording' ? undefined : '6px',
                animationDelay: `${i * 0.08}s`,
              }}
            />
          ))}
        </div>
        {/* Add keyframe in global CSS if not present — @keyframes wave { 0%,100%{height:6px} 50%{height:28px} } */}

        {/* Record controls */}
        <div className="flex gap-2 mb-2">
          <button
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-md text-sm font-semibold transition-all',
              state === 'recording'
                ? 'bg-red-600 text-white shadow-[0_0_0_3px_oklch(0.65_0.18_25/0.2)]'
                : 'bg-red-600/80 hover:bg-red-600 text-white',
            )}
            onClick={state === 'recording' ? stopRecording : startRecording}
          >
            {state === 'recording' ? '⏹ Stop' : '⏺ Record'}
          </button>
          <button
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-semibold border transition-all',
              blob
                ? 'border-border bg-secondary hover:bg-accent text-foreground'
                : 'border-border/30 bg-secondary/20 text-muted-foreground/30 pointer-events-none',
            )}
            onClick={() => blob && new Audio(playbackUrl!).play()}
            disabled={!blob}
          >
            ▶ Playback
          </button>
        </div>
        {attempt > 0 && (
          <p className="text-sm text-muted-foreground/50 text-center mb-3">
            Attempt {attempt} · Re-record anytime before submitting
          </p>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-500/8 border border-red-500/20 rounded-md px-3 py-2 mb-3">
            {error}
          </div>
        )}

        {!result && (
          <Button
            className="w-full"
            disabled={!blob || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Scoring…' : 'Submit for scoring →'}
          </Button>
        )}

        {/* Results */}
        {result && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-3">Azure Assessment</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {(['accuracy', 'fluency', 'completeness', 'prosody'] as const).map(k => (
                <div key={k} className="bg-secondary border border-border rounded-md p-2.5 text-center">
                  <div className={cn('text-xl font-bold', scoreColor(result.overall[k]))}>{Math.round(result.overall[k])}</div>
                  <div className="text-[9px] text-muted-foreground mt-1 capitalize">{k}</div>
                </div>
              ))}
            </div>
            {result.words.map((w, i) => (
              <div key={i} className="flex items-center gap-3 bg-secondary/40 rounded-lg px-3 py-2 mb-1.5">
                <span className={cn('text-base font-bold min-w-[40px]', scoreColor(w.accuracy))}>{w.word}</span>
                <div className="flex-1 h-0.5 bg-border rounded-full">
                  <div className={cn('h-full rounded-full', w.accuracy >= 80 ? 'bg-green-400' : w.accuracy >= 60 ? 'bg-yellow-400' : 'bg-red-400')} style={{ width: `${w.accuracy}%` }} />
                </div>
                <span className={cn('text-sm font-semibold min-w-[28px] text-right', scoreColor(w.accuracy))}>{Math.round(w.accuracy)}</span>
                {w.error_detail && <span className="text-sm text-muted-foreground">{w.error_detail}</span>}
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <button
                className="flex-1 py-3 rounded-md text-sm font-semibold bg-red-500/8 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors"
                onClick={() => { setResult(null); setBlob(null); setState('idle') }}
              >
                ⏺ Try again
              </button>
              <Button className="flex-1" onClick={() => onNext(result.overall.accuracy >= 70)}>
                Next →
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Add the `wave` keyframe to the global CSS** (`frontend/src/index.css` or equivalent):

  ```css
  @keyframes wave {
    0%, 100% { height: 6px; }
    50% { height: 28px; }
  }
  ```

- [ ] **Commit**

  ```bash
  git add frontend/src/components/study/exercises/PronunciationReferee.tsx frontend/src/index.css
  git commit -m "feat: add PronunciationReferee with record/playback/submit loop and Azure scores"
  ```

---

### Task 20: `StudySessionPage` — orchestrator

**Files:**
- Create: `frontend/src/pages/StudySessionPage.tsx`

- [ ] **Implement `StudySessionPage`**

  ```tsx
  // frontend/src/pages/StudySessionPage.tsx
  import { useState, useMemo, useEffect } from 'react'
  import { useNavigate, useParams } from 'react-router-dom'
  import { useVocabulary } from '@/hooks/useVocabulary'
  import { useAuth } from '@/contexts/AuthContext'
  import { ModePicker, type ExerciseMode } from '@/components/study/ModePicker'
  import { ProgressBar } from '@/components/study/ProgressBar'
  import { SessionSummary } from '@/components/study/SessionSummary'
  import { ClozeExercise } from '@/components/study/exercises/ClozeExercise'
  import { DictationExercise } from '@/components/study/exercises/DictationExercise'
  import { PinyinRecallExercise } from '@/components/study/exercises/PinyinRecallExercise'
  import { PronunciationReferee } from '@/components/study/exercises/PronunciationReferee'
  import { ReconstructionExercise } from '@/components/study/exercises/ReconstructionExercise'
  import { useTTS } from '@/hooks/useTTS'
  import type { VocabEntry } from '@/types'

  type Phase = 'picker' | 'session' | 'summary'

  interface Question {
    type: Exclude<ExerciseMode, 'mixed'>
    entry: VocabEntry
    // AI-generated content fetched before session starts:
    clozeData?: { story: string; blanks: string[] }
    pronunciationData?: { sentence: string; translation: string }
    reconstructionTokens?: string[]
  }

  const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

  // Build a flat reconstruction token list from Segment.words for an entry
  function getReconstructionTokens(entry: VocabEntry, allEntries: VocabEntry[]): string[] {
    // Use words from same segment (other entries from same segment share the Chinese text)
    const segWords = allEntries
      .filter(e => e.sourceSegmentId === entry.sourceSegmentId)
      .map(e => e.word)
      .filter(w => entry.sourceSegmentChinese.includes(w))
    // Deduplicate
    return [...new Set(segWords)]
  }

  function distributeExercises(
    entries: VocabEntry[],
    mode: ExerciseMode,
    count: number,
    hasAzure: boolean,
  ): Exclude<ExerciseMode, 'mixed'>[] {
    const available: Exclude<ExerciseMode, 'mixed'>[] = ['cloze', 'dictation', 'pinyin', 'reconstruction']
    if (hasAzure) available.push('pronunciation')

    if (mode !== 'mixed') {
      return Array.from({ length: count }, () => mode as Exclude<ExerciseMode, 'mixed'>)
    }

    // Mixed: ensure each type appears at least once when count >= types.length
    const result: Exclude<ExerciseMode, 'mixed'>[] = []
    if (count >= available.length) {
      result.push(...available)
    }
    while (result.length < count) {
      result.push(available[Math.floor(Math.random() * available.length)])
    }
    // Shuffle
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result.slice(0, count)
  }

  export function StudySessionPage() {
    const { lessonId } = useParams<{ lessonId: string }>()
    const navigate = useNavigate()
    const { entriesByLesson } = useVocabulary()
    const { db, keys } = useAuth()
    const { playTTS } = useTTS(db, keys)

    const entries = entriesByLesson[lessonId ?? ''] ?? []
    const lessonTitle = entries[0]?.sourceLessonTitle ?? 'Unknown Lesson'

    const [phase, setPhase] = useState<Phase>('picker')
    const [mode, setMode] = useState<ExerciseMode>('mixed')
    const [count, setCount] = useState(10)
    const [questions, setQuestions] = useState<Question[]>([])
    const [current, setCurrent] = useState(0)
    const [results, setResults] = useState<{ entry: VocabEntry; correct: boolean }[]>([])
    const [loading, setLoading] = useState(false)
    const [azureBanner, setAzureBanner] = useState(false)

    const hasAzure = Boolean(keys?.azureSpeechKey)

    async function fetchAIContent(types: Exclude<ExerciseMode, 'mixed'>[], pool: VocabEntry[]) {
      const clozeWords = pool.slice(0, 5).map(e => ({ word: e.word, pinyin: e.pinyin, meaning: e.meaning, usage: e.usage }))
      const pronWords = pool.map(e => ({ word: e.word, pinyin: e.pinyin, meaning: e.meaning, usage: e.usage }))
      const pronCount = types.filter(t => t === 'pronunciation').length
      const clozeCount = types.filter(t => t === 'cloze').length

      const [clozeResp, pronResp] = await Promise.all([
        clozeCount > 0
          ? fetch(`${API_BASE}/api/quiz/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                openai_api_key: keys?.openaiApiKey,
                words: clozeWords,
                exercise_type: 'cloze',
                story_count: clozeCount,
              }),
            }).then(r => r.json())
          : Promise.resolve({ exercises: [] }),
        pronCount > 0
          ? fetch(`${API_BASE}/api/quiz/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                openai_api_key: keys?.openaiApiKey,
                words: pronWords,
                exercise_type: 'pronunciation_sentence',
                count: pronCount,
              }),
            }).then(r => r.json())
          : Promise.resolve({ exercises: [] }),
      ])

      return { clozeExercises: clozeResp.exercises ?? [], pronExercises: pronResp.exercises ?? [] }
    }

    async function handleStart() {
      if (entries.length === 0) return
      setLoading(true)

      const types = distributeExercises(entries, mode, count, hasAzure)
      if (mode === 'mixed' && !hasAzure) setAzureBanner(true)

      const pool = [...entries].sort(() => Math.random() - 0.5)

      try {
        const { clozeExercises, pronExercises } = await fetchAIContent(types, pool)
        let clozeIdx = 0; let pronIdx = 0

        const qs: Question[] = types.map((type, i) => {
          const entry = pool[i % pool.length]
          const q: Question = { type, entry }
          if (type === 'cloze') q.clozeData = clozeExercises[clozeIdx++]
          if (type === 'pronunciation') q.pronunciationData = pronExercises[pronIdx++]
          if (type === 'reconstruction') q.reconstructionTokens = getReconstructionTokens(entry, entries)
          return q
        })

        setQuestions(qs)
        setCurrent(0)
        setResults([])
        setPhase('session')
      } catch {
        // If AI fails, fall back to client-side exercises only
        const fallbackTypes = types.map(t => (t === 'cloze' ? 'pinyin' : t)) as Exclude<ExerciseMode, 'mixed'>[]
        const qs: Question[] = fallbackTypes.map((type, i) => {
          const entry = pool[i % pool.length]
          const q: Question = { type, entry }
          if (type === 'reconstruction') q.reconstructionTokens = getReconstructionTokens(entry, entries)
          return q
        })
        setQuestions(qs)
        setCurrent(0)
        setResults([])
        setPhase('session')
      } finally {
        setLoading(false)
      }
    }

    function handleNext(correct: boolean) {
      const q = questions[current]
      setResults(r => [...r, { entry: q.entry, correct }])
      if (current + 1 >= questions.length) {
        setPhase('summary')
      } else {
        setCurrent(c => c + 1)
      }
    }

    const q = questions[current]

    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-6 py-10 pb-20">
          {/* Picker */}
          {phase === 'picker' && (
            <ModePicker
              selected={mode}
              onSelect={setMode}
              count={count}
              onCountChange={setCount}
              onStart={handleStart}
              lessonTitle={lessonTitle}
            />
          )}

          {loading && (
            <div className="text-center py-20 text-muted-foreground text-sm">Generating exercises…</div>
          )}

          {/* Session */}
          {phase === 'session' && q && !loading && (
            <>
              {azureBanner && (
                <div className="text-sm text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded-md px-4 py-3 mb-4">
                  Pronunciation exercises are unavailable — add an Azure Speech Key in Settings.
                </div>
              )}
              <ProgressBar current={current} total={questions.length} />
              {q.type === 'pinyin' && (
                <PinyinRecallExercise entry={q.entry} onNext={handleNext} playTTS={playTTS} />
              )}
              {q.type === 'dictation' && (
                <DictationExercise entry={q.entry} onNext={handleNext} playTTS={playTTS} />
              )}
              {q.type === 'cloze' && q.clozeData && (
                <ClozeExercise question={q.clozeData} entries={entries} onNext={handleNext} />
              )}
              {q.type === 'pronunciation' && q.pronunciationData && (
                <PronunciationReferee
                  sentence={q.pronunciationData}
                  apiBaseUrl={API_BASE}
                  azureKey={keys?.azureSpeechKey ?? ''}
                  azureRegion={keys?.azureSpeechRegion ?? 'eastus'}
                  onNext={handleNext}
                />
              )}
              {q.type === 'reconstruction' && (
                <ReconstructionExercise
                  entry={q.entry}
                  words={q.reconstructionTokens ?? [q.entry.word]}
                  onNext={handleNext}
                />
              )}
            </>
          )}

          {/* Summary */}
          {phase === 'summary' && (
            <SessionSummary
              results={results}
              onStudyAgain={() => { setPhase('picker') }}
              onBack={() => navigate('/vocabulary')}
            />
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Type-check everything**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Fix any type errors before committing.

- [ ] **Commit**

  ```bash
  git add frontend/src/pages/StudySessionPage.tsx
  git commit -m "feat: add StudySessionPage orchestrating all exercise types with mixed mode"
  ```

---

## Chunk 7: Final Wiring + Smoke Test

### Task 21: Register routes and run full test suite

**Files:**
- Modify: `frontend/src/App.tsx` (confirm routes are registered)

- [ ] **Confirm `StudySessionPage` is imported and routed in `App.tsx`**

  ```tsx
  import { WorkbookPage } from '@/pages/WorkbookPage'
  import { StudySessionPage } from '@/pages/StudySessionPage'
  // In <Routes>:
  <Route path="/vocabulary" element={<WorkbookPage />} />
  <Route path="/vocabulary/:lessonId/study" element={<StudySessionPage />} />
  ```

- [ ] **Run the full frontend test suite**

  ```bash
  cd frontend && npx vitest run 2>&1 | tail -30
  ```

  Expected: all existing tests pass + new tests pass.

- [ ] **Build to check for any remaining type/import errors**

  ```bash
  cd frontend && npm run build 2>&1 | tail -30
  ```

  Expected: build succeeds with no errors.

- [ ] **Smoke-test the backend**

  ```bash
  cd backend && uvicorn app.main:app --reload &
  curl -s http://localhost:8000/api/health
  # Expected: {"status":"ok"}
  curl -s http://localhost:8000/openapi.json | python3 -c "import json,sys; paths=json.load(sys.stdin)['paths']; print(list(paths.keys()))"
  # Expected: includes /api/quiz/generate and /api/pronunciation/assess
  ```

- [ ] **Final commit**

  ```bash
  git add frontend/src/App.tsx
  git commit -m "feat: wire /vocabulary routes — Vocabulary Workbook feature complete"
  ```

---

## Done ✓

The feature is complete when:
- Saving a word from the lesson transcript shows a toast and fills the bookmark icon
- `/vocabulary` shows all saved words grouped by lesson with a Study button
- Study sessions cycle through exercises with a progress bar and end on the summary screen
- Pronunciation Referee records audio, allows playback, and submits to Azure for scoring
- "Jump to source" links navigate back to the exact segment in the original lesson
- All tests pass and the build succeeds
