# Chinese Input Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app Pinyin IME so any user can type Chinese characters without an OS IME, and add a stroke-order writing exercise using `hanzi-writer`.

**Architecture:** `ChineseInput` wraps the native `<input>` element — intercepting keystrokes to buffer pinyin syllables and showing a floating candidate picker via a React portal. `CharacterWritingExercise` wraps `hanzi-writer` in a `HanziWriterCanvas` component and slots into the existing `StudySession` exercise rotation.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + @testing-library/react, Tailwind CSS, shadcn/ui, `hanzi-writer` (npm)

**Spec:** `docs/superpowers/specs/2026-03-16-chinese-input-design.md`

---

## Chunk 1: Pinyin IME

---

### Task 1: Pinyin dictionary module

**Files:**
- Create: `frontend/src/lib/pinyin-dict.json`
- Create: `frontend/src/lib/pinyin-dict.ts`
- Create: `frontend/tests/pinyin-dict.test.ts`

**Background:** The dictionary maps pinyin syllables to frequency-sorted hanzi candidate arrays. The JSON is a Vite static import — bundled at build time, no network request.

**JSON format:**
```json
{
  "a": ["啊", "阿", "哎", "哀"],
  "ni": ["你", "尼", "泥", "拟", "逆"],
  "hao": ["好", "号", "毫", "豪", "郝"],
  "wo": ["我", "卧", "握", "窝"],
  "men": ["们", "门", "闷", "焖"],
  "shi": ["是", "时", "事", "市", "式", "使", "世", "示"]
}
```

**Sourcing the full dictionary:** Download from [`github.com/nk2028/commonly-used-chinese-characters-and-words`](https://github.com/nk2028/commonly-used-chinese-characters-and-words) or generate from CC-CEDICT. The format must be `{ [syllable: string]: string[] }` where the array is sorted by character frequency (most common first). For this task, a seed dict of ~30 syllables is sufficient — the full dict can be added later.

**`getCandidates` function:** Takes a syllable string, returns the candidate array (or `[]`). Case-insensitive.

- [ ] **Step 1: Enable `resolveJsonModule` in tsconfig**

Add `"resolveJsonModule": true` to `frontend/tsconfig.app.json` under `compilerOptions`. This is required for `tsc --noEmit` to accept the static JSON import. Vite already handles JSON imports natively without this flag, but the type-checker needs it.

```json
// frontend/tsconfig.app.json — add inside "compilerOptions":
"resolveJsonModule": true,
```

- [ ] **Step 2: Write the failing test**

Create `frontend/tests/pinyin-dict.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { getCandidates } from '@/lib/pinyin-dict'

describe('getCandidates', () => {
  it('returns candidates for a known syllable', () => {
    const result = getCandidates('ni')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toBe('你')
  })

  it('is case-insensitive', () => {
    expect(getCandidates('NI')).toEqual(getCandidates('ni'))
  })

  it('returns empty array for unknown syllable', () => {
    expect(getCandidates('zzz')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(getCandidates('')).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/pinyin-dict.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Create the seed dictionary**

Create `frontend/src/lib/pinyin-dict.json` with at least these syllables (add more as needed):
```json
{
  "a": ["啊", "阿", "哎", "哀", "爱"],
  "ai": ["爱", "哀", "矮", "碍", "埃"],
  "an": ["安", "暗", "岸", "案", "按"],
  "ba": ["把", "吧", "爸", "八", "拔"],
  "bei": ["被", "北", "背", "杯", "悲"],
  "bu": ["不", "步", "部", "布", "补"],
  "chi": ["吃", "持", "迟", "痴", "尺"],
  "da": ["大", "打", "达", "搭", "答"],
  "de": ["的", "得", "地", "德"],
  "dou": ["都", "斗", "豆", "抖", "兜"],
  "er": ["而", "耳", "二", "儿", "尔"],
  "ge": ["个", "各", "歌", "格", "隔"],
  "guo": ["国", "果", "过", "锅", "裹"],
  "hao": ["好", "号", "毫", "豪", "郝"],
  "he": ["和", "河", "喝", "核", "合"],
  "hen": ["很", "狠", "恨", "痕"],
  "ji": ["几", "机", "及", "己", "记"],
  "jia": ["家", "加", "假", "价", "夹"],
  "jiu": ["就", "旧", "九", "久", "救"],
  "lai": ["来", "赖", "莱", "睐"],
  "le": ["了", "乐", "勒"],
  "li": ["里", "理", "力", "例", "利"],
  "lian": ["联", "练", "脸", "链", "连"],
  "ma": ["吗", "妈", "马", "麻", "骂"],
  "mei": ["没", "美", "每", "妹", "煤"],
  "men": ["们", "门", "闷", "焖"],
  "ming": ["明", "名", "命", "鸣", "茗"],
  "na": ["那", "拿", "哪", "纳", "娜"],
  "ne": ["呢", "讷"],
  "ni": ["你", "尼", "泥", "拟", "逆"],
  "nian": ["年", "念", "粘", "鲶"],
  "ning": ["宁", "凝", "柠", "拧"],
  "ren": ["人", "认", "忍", "仁", "任"],
  "ri": ["日"],
  "she": ["社", "设", "射", "蛇", "摄"],
  "shi": ["是", "时", "事", "市", "式", "使", "世", "示", "石", "实"],
  "shuo": ["说", "朔", "硕"],
  "ta": ["他", "她", "它", "塔", "踏"],
  "tai": ["太", "台", "态", "抬", "泰"],
  "tian": ["天", "田", "甜", "填", "添"],
  "wo": ["我", "卧", "握", "窝", "涡"],
  "xian": ["现", "先", "显", "线", "县"],
  "xie": ["谢", "写", "些", "鞋", "协"],
  "xin": ["心", "新", "信", "欣", "辛"],
  "xing": ["行", "性", "星", "形", "型"],
  "ya": ["呀", "也", "牙", "哑", "鸦"],
  "ye": ["也", "业", "夜", "页", "叶"],
  "yi": ["一", "以", "已", "意", "义", "也", "易", "亿"],
  "you": ["有", "又", "友", "由", "游"],
  "yuan": ["元", "原", "远", "院", "源"],
  "yue": ["月", "越", "约", "乐", "岳"],
  "zai": ["在", "再", "载", "宰"],
  "zhe": ["这", "者", "折", "哲", "遮"],
  "zhi": ["知", "之", "只", "支", "直", "值", "志", "制"],
  "zhong": ["中", "重", "众", "种", "终"],
  "zhu": ["主", "住", "助", "祝", "注"]
}
```

- [ ] **Step 5: Create the module**

Create `frontend/src/lib/pinyin-dict.ts`:
```ts
import dict from '@/lib/pinyin-dict.json'

const pinyinDict: Record<string, string[]> = dict

export function getCandidates(syllable: string): string[] {
  if (!syllable) return []
  return pinyinDict[syllable.toLowerCase()] ?? []
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd frontend && npx vitest run tests/pinyin-dict.test.ts
```
Expected: all 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/tsconfig.app.json frontend/src/lib/pinyin-dict.json frontend/src/lib/pinyin-dict.ts frontend/tests/pinyin-dict.test.ts
git commit -m "feat(ime): add pinyin dictionary module"
```

---

### Task 2: ChineseInput component

**Files:**
- Create: `frontend/src/components/ui/ChineseInput.tsx`
- Create: `frontend/tests/ChineseInput.test.tsx`

**How it works:**

The component maintains internal `buffer` state (the pinyin syllable currently being typed). The actual `<input>` element displays `value + buffer`. When a candidate is selected, the buffer clears and `onChange` is called with a synthetic event containing `value + selectedChar`.

**Key interception logic:**
- Letter key (`/^[a-z]$/i`) → `e.preventDefault()`, append to buffer, do NOT call parent `onChange` or `onKeyDown`
- `Backspace` with non-empty buffer → `e.preventDefault()`, remove last char from buffer
- `Escape` with non-empty buffer → `e.preventDefault()`, clear buffer
- `Space` or `Enter` with candidates visible → `e.preventDefault()`, select first candidate
- `1`–`9` with candidates visible → `e.preventDefault()`, select candidate by index
- Any other key (including `Space`/`Enter` with no candidates) → forward to parent `onKeyDown`

**Candidate bar:** A `<div>` portal attached to `document.body`. Positioned using `getBoundingClientRect()` on the input's container ref. All candidate elements have `tabIndex={-1}` (non-focusable).

**Composition events:** If `compositionstart` fires (user's OS IME is composing), set an `isComposing` ref to `true` and disable buffer logic until `compositionend`. This allows users who DO have an OS IME to continue using it normally.

**Props interface:**
```ts
interface ChineseInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}
```

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/ChineseInput.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChineseInput } from '@/components/ui/ChineseInput'

function setup(value = '', onChange = vi.fn()) {
  const { rerender } = render(
    <ChineseInput value={value} onChange={onChange} placeholder="Type..." />,
  )
  const input = screen.getByPlaceholderText('Type...')
  return { input, onChange, rerender }
}

describe('ChineseInput', () => {
  it('renders the input with the provided value', () => {
    const { input } = setup('你好')
    expect((input as HTMLInputElement).value).toBe('你好')
  })

  it('shows candidates when a known syllable is typed', () => {
    const { input } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    expect(screen.getByText('你')).toBeTruthy()
  })

  it('selects the first candidate on Space', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '你' }) }),
    )
  })

  it('selects the first candidate on Enter when candidates are visible', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '你' }) }),
    )
  })

  it('selects by number key', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: '2' })
    // second candidate for 'ni'
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '尼' }) }),
    )
  })

  it('clears buffer on Escape without calling onChange', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('你')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('appends to existing value on candidate selection', () => {
    const { input, onChange } = setup('我')
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '我你' }) }),
    )
  })

  it('forwards Enter to onKeyDown when no candidates are visible', () => {
    const onKeyDown = vi.fn()
    const { input } = render(
      <ChineseInput value="" onChange={vi.fn()} onKeyDown={onKeyDown} placeholder="Type..." />,
    )
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('does not call onKeyDown for letter keys going into buffer', () => {
    const onKeyDown = vi.fn()
    const { input } = render(
      <ChineseInput value="" onChange={vi.fn()} onKeyDown={onKeyDown} placeholder="Type..." />,
    )
    fireEvent.keyDown(input, { key: 'n' })
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('removes last char from buffer on Backspace', () => {
    const { input } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: 'Backspace' })
    // buffer is now 'n', candidates for 'n' alone — 'ni' candidates gone
    expect(screen.queryByText('你')).toBeNull()
  })

  it('does not forward Enter to onKeyDown when buffer is active but has no candidates', () => {
    // 'q' is not in the dict — buffer active, no candidates
    const onKeyDown = vi.fn()
    const { input } = render(
      <ChineseInput value="" onChange={vi.fn()} onKeyDown={onKeyDown} placeholder="Type..." />,
    )
    fireEvent.keyDown(input, { key: 'q' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onKeyDown).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/ChineseInput.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ChineseInput**

Create `frontend/src/components/ui/ChineseInput.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCandidates } from '@/lib/pinyin-dict'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ChineseInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function ChineseInput({ value, onChange, onKeyDown, disabled, ...rest }: ChineseInputProps) {
  const [buffer, setBuffer] = useState('')
  const [barPos, setBarPos] = useState<{ top: number, left: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)

  const candidates = getCandidates(buffer)
  const showCandidates = candidates.length > 0

  // Reposition candidate bar when buffer changes.
  // Uses `position: fixed` so coordinates are viewport-relative — do NOT add scrollY/scrollX.
  // Bar appears below the input (same as phone keyboards).
  useEffect(() => {
    if (!showCandidates || !wrapperRef.current) {
      setBarPos(null)
      return
    }
    const rect = wrapperRef.current.getBoundingClientRect()
    setBarPos({ top: rect.bottom + 4, left: rect.left })
  }, [showCandidates, buffer])

  function fireChange(newValue: string) {
    const event = {
      target: { value: newValue },
    } as React.ChangeEvent<HTMLInputElement>
    onChange(event)
  }

  function selectCandidate(char: string) {
    setBuffer('')
    fireChange(value + char)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isComposingRef.current) return

    // Candidate selection keys
    if (showCandidates) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        selectCandidate(candidates[0])
        return
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        if (candidates[idx]) {
          e.preventDefault()
          selectCandidate(candidates[idx])
          return
        }
      }
    }

    // Buffer editing
    if (/^[a-z]$/i.test(e.key)) {
      e.preventDefault()
      setBuffer(b => b + e.key.toLowerCase())
      return
    }

    if (e.key === 'Backspace' && buffer.length > 0) {
      e.preventDefault()
      setBuffer(b => b.slice(0, -1))
      return
    }

    if (e.key === 'Escape' && buffer.length > 0) {
      e.preventDefault()
      setBuffer('')
      return
    }

    // Only forward to parent when buffer is empty — never forward when
    // the user is mid-syllable, even if there are no candidates yet.
    if (buffer.length > 0) return

    onKeyDown?.(e)
  }

  const displayValue = value + buffer

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        {...rest}
        value={displayValue}
        onChange={() => {}} // controlled via keyDown interception
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false
          // Let the OS IME commit its value normally
          const input = e.currentTarget
          fireChange(input.value)
          setBuffer('')
        }}
        disabled={disabled}
      />

      {showCandidates && barPos && createPortal(
        <div
          className="fixed z-50 flex gap-1 rounded-md border border-border bg-popover shadow-md p-1"
          style={{ top: barPos.top, left: barPos.left }}
        >
          {candidates.slice(0, 9).map((char, i) => (
            <button
              key={char}
              type="button"
              tabIndex={-1}
              className={cn(
                'flex items-center gap-0.5 px-2 py-1 rounded text-sm hover:bg-accent cursor-pointer',
              )}
              onMouseDown={(e) => {
                e.preventDefault() // prevent input blur
                selectCandidate(char)
              }}
            >
              <span className="text-muted-foreground text-xs">{i + 1}</span>
              <span>{char}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/ChineseInput.test.tsx
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/ChineseInput.tsx frontend/tests/ChineseInput.test.tsx
git commit -m "feat(ime): add ChineseInput component with pinyin candidate picker"
```

---

### Task 3: Update DictationExercise

**Files:**
- Modify: `frontend/src/components/study/exercises/DictationExercise.tsx`

**Changes:**
- Import `ChineseInput` instead of `Input`
- Remove `pinyinMode` state and the pinyin/hanzi toggle button
- The `expected` value is always `entry.sourceSegmentChinese` (no more pinyin branch)
- `placeholder` becomes `'Type what you heard…'`

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
cd frontend && npx vitest run tests/
```
Note the current pass/fail state before making changes.

- [ ] **Step 2: Update DictationExercise**

In `frontend/src/components/study/exercises/DictationExercise.tsx`:

```tsx
import type { VocabEntry } from '@/types'
import { Volume2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChineseInput } from '@/components/ui/ChineseInput'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
}

export function DictationExercise({ entry, progress = '', onNext, playTTS }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const expected = entry.sourceSegmentChinese
  const correct = value.trim() === expected.trim()

  const footer = (
    <div className="flex items-center justify-between px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard type="Dictation" progress={progress} footer={footer}>
      <p className="text-sm text-muted-foreground mb-4">
        Listen carefully and type what you hear in Chinese.
      </p>

      <button
        type="button"
        aria-label="Play audio"
        className="flex items-center justify-center mx-auto mb-5 size-14 rounded-full border border-border bg-secondary hover:bg-accent transition-colors"
        onClick={() => void playTTS(entry.sourceSegmentChinese)}
      >
        <Volume2 className="size-5 text-muted-foreground" />
      </button>

      <ChineseInput
        placeholder="Type what you heard…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {checked && (
        <div className={cn(
          'mt-4 rounded-lg border px-4 py-2.5 text-sm',
          correct
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
            : 'border-destructive/25 bg-destructive/10 text-destructive',
        )}
        >
          {correct ? '✓ Correct!' : `✗ Incorrect — ${expected}`}
        </div>
      )}
    </ExerciseCard>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
cd frontend && npx vitest run tests/
```
Expected: all previously passing tests still PASS. Fix any regressions before proceeding.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/study/exercises/DictationExercise.tsx
git commit -m "feat(ime): use ChineseInput in DictationExercise, remove pinyin toggle"
```

---

### Task 4: Update Shadowing chain (cascade)

**Files:**
- Modify: `frontend/src/components/shadowing/ShadowingDictationPhase.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingPanel.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingRevealPhase.tsx`

These three files form a cascade — change them together in one commit.

**Changes:**

`ShadowingDictationPhase`:
- Import `ChineseInput` instead of `Input`
- Remove `inputMode` state and the hanzi/pinyin toggle row
- Change `onSubmit` signature from `(answer: string, inputMode: 'hanzi' | 'pinyin')` to `(answer: string)`
- Update `handleSubmit` to call `onSubmit(value.trim())`
- Update placeholder to `'输入汉字…'`

`ShadowingPanel`:
- Remove `dictationInputMode` state (`useState<'hanzi' | 'pinyin'>`)
- Change `handleDictationSubmit` from `(answer, inputMode)` to `(answer: string)`
- Remove `inputMode={dictationInputMode}` from the `ShadowingRevealPhase` render

`ShadowingRevealPhase`:
- Remove `inputMode: 'hanzi' | 'pinyin'` from `DictationRevealProps`
- Replace the conditional diff with hardcoded `computeCharDiff`:
  ```ts
  // Before:
  return props.inputMode === 'hanzi'
    ? computeCharDiff(props.userAnswer, segment.chinese)
    : computePinyinDiff(props.userAnswer, segment.pinyin)
  // After:
  return computeCharDiff(props.userAnswer, segment.chinese)
  ```
- Remove the now-unused `computePinyinDiff` import
- Remove the `eslint-disable-next-line react-hooks/exhaustive-deps` comment on the `useMemo`

- [ ] **Step 1: Run ShadowingPanel tests to establish baseline**

```bash
cd frontend && npx vitest run tests/ShadowingPanel.test.tsx
```

- [ ] **Step 2: Update all three files**

**`ShadowingDictationPhase.tsx`** — replace `<Input ref={inputRef} ...>` block and remove toggle:
- Import `ChineseInput` instead of `Input`
- Remove `inputMode` state and the toggle `<div>` (lines 119–136 in original)
- Change `onSubmit` prop type to `(answer: string) => void`
- Update `handleSubmit` to call `onSubmit(value.trim())`
- Update placeholder to `'输入汉字…'` only (no conditional)

**`ShadowingPanel.tsx`** — key changes (show diffs only):
```tsx
// Remove:
const [dictationInputMode, setDictationInputMode] = useState<'hanzi' | 'pinyin'>('hanzi')

// Change:
function handleDictationSubmit(answer: string, inputMode: 'hanzi' | 'pinyin') {
  setDictationAnswer(answer)
  setDictationInputMode(inputMode)
  setPhase('reveal')
}
// To:
function handleDictationSubmit(answer: string) {
  setDictationAnswer(answer)
  setPhase('reveal')
}

// Remove from ShadowingRevealPhase render:
inputMode={dictationInputMode}
```

**`ShadowingRevealPhase.tsx`** — key changes:
```tsx
// Remove from DictationRevealProps:
inputMode: 'hanzi' | 'pinyin'

// Replace in useMemo:
return props.inputMode === 'hanzi'
  ? computeCharDiff(props.userAnswer, segment.chinese)
  : computePinyinDiff(props.userAnswer, segment.pinyin)
// With:
return computeCharDiff(props.userAnswer, segment.chinese)

// Remove unused import:
import { computeCharDiff, computePinyinDiff } from '@/lib/shadowing-utils'
// →
import { computeCharDiff } from '@/lib/shadowing-utils'

// Remove the eslint-disable comment above the useMemo deps array.
```

- [ ] **Step 3: Run all tests**

```bash
cd frontend && npx vitest run tests/
```
Expected: all previously passing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingDictationPhase.tsx \
        frontend/src/components/shadowing/ShadowingPanel.tsx \
        frontend/src/components/shadowing/ShadowingRevealPhase.tsx
git commit -m "feat(ime): use ChineseInput in shadowing dictation, drop inputMode cascade"
```

---

### Task 5: Update ClozeExercise

**Files:**
- Modify: `frontend/src/components/study/exercises/ClozeExercise.tsx`

**Note:** The inline `<input>` elements in `ClozeExercise` sit inside flowing text with `overflow-hidden` on the parent `ExerciseCard`. The `ChineseInput` candidate bar uses a `createPortal` to `document.body`, so clipping is not an issue — it works the same as in the standalone exercises.

**Changes:**
- Replace `import { Input }` / `<input>` with `ChineseInput`
- The inline inputs use `className` for inline-block styling; `ChineseInput` renders a wrapper `<div>` — set `className` on the `<div>` wrapper or add an `inline` variant. The simplest fix: add a `wrapperClassName` prop to `ChineseInput` (or inline `style={{ display: 'inline-block', width: '3.5rem' }}`).

Actually, the inline inputs in `ClozeExercise` are inline elements in a paragraph. Since `ChineseInput` renders a `<div>` wrapper, you need to handle this:

Option: Expose a `wrapperClassName` prop on `ChineseInput` to allow setting `inline-block`:
```tsx
// In ChineseInput
interface ChineseInputProps ... {
  wrapperClassName?: string
}
// In JSX:
<div ref={wrapperRef} className={cn('relative', wrapperClassName)}>
```

Then in `ClozeExercise`, replace each inline `<input>` with `ChineseInput`. Use `autoFocus` on the first blank instead of the existing `firstInputRef`/`useEffect` approach:
```tsx
<ChineseInput
  key={i}
  wrapperClassName="inline-block w-14 mx-1"
  className="w-14 text-center text-sm border-0 border-b bg-transparent px-1 rounded-none focus-visible:ring-0"
  value={answers[i] ?? ''}
  onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
  disabled={checked}
  placeholder="…"
  autoFocus={i === blankIndices[0]}  // replaces firstInputRef + useEffect
/>
```

- [ ] **Step 1: Add `wrapperClassName` prop to ChineseInput**

Edit `frontend/src/components/ui/ChineseInput.tsx` — add `wrapperClassName?: string` to the interface and apply it to the wrapper `<div>` using `cn('relative', wrapperClassName)`.

- [ ] **Step 2: Update ClozeExercise**

Replace all `<input>` elements (the inline blank inputs) with `ChineseInput` using the snippet above. Remove `firstInputRef`, the `useEffect` focus call, and the `useRef` import if it is no longer used.

- [ ] **Step 3: Run all tests**

```bash
cd frontend && npx vitest run tests/
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/ChineseInput.tsx \
        frontend/src/components/study/exercises/ClozeExercise.tsx
git commit -m "feat(ime): use ChineseInput in ClozeExercise inline blanks"
```

---

## Chunk 2: Character Writing Exercise

---

### Task 6: Writing support utility

**Files:**
- Create: `frontend/src/lib/hanzi-writer-chars.ts`
- Create: `frontend/tests/hanzi-writer-chars.test.ts`

**Approach:** Rather than a JSON file, use a Unicode range check. `hanzi-writer` supports all characters in the CJK Unified Ideographs block (U+4E00–U+9FFF), which covers 20,902 characters — more than enough for all common Chinese vocabulary. A range check is O(1) and adds zero bundle overhead.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/hanzi-writer-chars.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isWritingSupported } from '@/lib/hanzi-writer-chars'

describe('isWritingSupported', () => {
  it('returns true for common characters', () => {
    expect(isWritingSupported('你')).toBe(true)
    expect(isWritingSupported('好')).toBe(true)
    expect(isWritingSupported('中国')).toBe(true)
  })

  it('returns false for non-CJK characters', () => {
    expect(isWritingSupported('hello')).toBe(false)
    expect(isWritingSupported('123')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isWritingSupported('')).toBe(false)
  })

  it('returns false if any character is unsupported', () => {
    expect(isWritingSupported('你A')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/hanzi-writer-chars.test.ts
```

- [ ] **Step 3: Implement**

Create `frontend/src/lib/hanzi-writer-chars.ts`:
```ts
// CJK Unified Ideographs block: U+4E00–U+9FFF
// hanzi-writer supports all characters in this range.
const CJK_START = 0x4E00
const CJK_END = 0x9FFF

export function isWritingSupported(word: string): boolean {
  if (!word) return false
  return [...word].every((char) => {
    const cp = char.codePointAt(0)
    return cp !== undefined && cp >= CJK_START && cp <= CJK_END
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run tests/hanzi-writer-chars.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/hanzi-writer-chars.ts frontend/tests/hanzi-writer-chars.test.ts
git commit -m "feat(writing): add isWritingSupported utility (CJK range check)"
```

---

### Task 7: Install hanzi-writer and create HanziWriterCanvas

**Files:**
- Create: `frontend/src/components/study/exercises/HanziWriterCanvas.tsx`

**Note on testing:** `hanzi-writer` manipulates the DOM directly (creates SVG elements) and requires a real canvas context. jsdom does not support this. Tests for `HanziWriterCanvas` itself are skipped — it is tested indirectly through `CharacterWritingExercise` integration tests, which mock the canvas component.

- [ ] **Step 1: Install hanzi-writer**

```bash
cd frontend && npm install hanzi-writer
```

`hanzi-writer` ships its own TypeScript declarations — there is no `@types/hanzi-writer` package.

Verify installation:
```bash
cd frontend && node -e "require('hanzi-writer'); console.log('ok')"
```

- [ ] **Step 2: Create HanziWriterCanvas**

Create `frontend/src/components/study/exercises/HanziWriterCanvas.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import HanziWriter from 'hanzi-writer'

interface Props {
  character: string
  writerRef?: React.RefObject<HanziWriter | null>
  onComplete: (usedHint: boolean) => void
}

export function HanziWriterCanvas({ character, writerRef, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internalWriterRef = useRef<HanziWriter | null>(null)
  const hintUsedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const writer = HanziWriter.create(container, character, {
      width: 200,
      height: 200,
      padding: 10,
      showOutline: true,
      strokeColor: '#ffffff',
      outlineColor: '#3f3f46',
      drawingColor: '#60a5fa',
      drawingWidth: 4,
    })

    internalWriterRef.current = writer
    if (writerRef) writerRef.current = writer
    hintUsedRef.current = false

    writer.quiz({
      onComplete: () => {
        onComplete(hintUsedRef.current)
      },
      leniency: 1,
      // After 3 missed strokes, hanzi-writer animates the hint automatically.
      // Mark hint as used when mistakesOnStroke reaches the threshold.
      showHintAfterMisses: 3,
      onMistake: (strokeData) => {
        if ((strokeData as any).mistakesOnStroke >= 3) {
          hintUsedRef.current = true
        }
      },
    })

    return () => {
      writer.cancelAnimation()
      if (container) container.innerHTML = ''
      internalWriterRef.current = null
      if (writerRef) writerRef.current = null
    }
  }, [character]) // re-mount when character changes

  return (
    <div className="relative">
      {/* Grid background: outer border + cross dividers */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #3f3f46 1px, transparent 1px),
            linear-gradient(to bottom, #3f3f46 1px, transparent 1px)
          `,
          backgroundSize: '100px 100px',
          backgroundPosition: '99px 99px',
          border: '1px solid #3f3f46',
        }}
      />
      <div ref={containerRef} style={{ width: 200, height: 200 }} />
    </div>
  )
}

// Expose animate method for parent to call (hint button)
export function animateCharacter(writerRef: React.RefObject<HanziWriter | null>, onComplete?: () => void) {
  writerRef.current?.animateCharacter({ onComplete })
}
```

**Note:** The `onMistake` callback has a TypeScript quirk — `hanzi-writer`'s quiz options type may be incomplete in `@types/hanzi-writer`. Cast as needed. The key data point is `strokeData.mistakesOnStroke` to detect when the auto-hint fires.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Fix any type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/study/exercises/HanziWriterCanvas.tsx
git commit -m "feat(writing): add HanziWriterCanvas component wrapping hanzi-writer"
```

---

### Task 8: CharacterWritingExercise

**Files:**
- Create: `frontend/src/components/study/exercises/CharacterWritingExercise.tsx`
- Create: `frontend/tests/CharacterWritingExercise.test.tsx`

**Flow for multi-character words:**
- `characters = [...entry.word]` — split into individual chars
- `charIndex` state tracks which character is currently being drawn
- When `onComplete(usedHint)` fires from `HanziWriterCanvas`, advance `charIndex`
- Track whether any character used a hint — determines `correct` passed to `onNext`
- When `charIndex === characters.length`, call `onNext(correct)`

**Hint button:**
- Calls `writer.animateCharacter()` via a ref exposed from `HanziWriterCanvas`
- Sets `hintUsed = true` for the current character
- After animation `onComplete`, the exercise shows "Continue →" button
- Clicking "Continue →" advances to next character (or ends exercise)

**Testing:** Mock `HanziWriterCanvas` with `vi.mock` — the exercise logic (charIndex, hint tracking, onNext) can be tested without the actual canvas.

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/CharacterWritingExercise.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { VocabEntry } from '@/types'

// Mock HanziWriterCanvas — simulate the canvas without actual hanzi-writer
vi.mock('@/components/study/exercises/HanziWriterCanvas', () => ({
  HanziWriterCanvas: ({ onComplete }: { onComplete: (usedHint: boolean) => void }) => (
    <div data-testid="canvas">
      <button onClick={() => onComplete(false)}>complete-no-hint</button>
      <button onClick={() => onComplete(true)}>complete-with-hint</button>
    </div>
  ),
  animateCharacter: vi.fn(),
}))

import { CharacterWritingExercise } from '@/components/study/exercises/CharacterWritingExercise'

const entry: VocabEntry = {
  id: '1', word: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', usage: '',
  sourceLessonId: 'l1', sourceLessonTitle: 'Lesson', sourceSegmentId: 's1',
  sourceSegmentChinese: '你好', sourceSegmentTranslation: 'hello', createdAt: '',
}

describe('CharacterWritingExercise', () => {
  it('shows first character and 1/2 progress for a two-char word', () => {
    render(<CharacterWritingExercise entry={entry} onNext={vi.fn()} />)
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByTestId('canvas')).toBeTruthy()
  })

  it('advances to second character after first completes without hint', () => {
    render(<CharacterWritingExercise entry={entry} onNext={vi.fn()} />)
    fireEvent.click(screen.getByText('complete-no-hint'))
    expect(screen.getByText('2 / 2')).toBeTruthy()
  })

  it('calls onNext(true) when all chars complete without hint', () => {
    const onNext = vi.fn()
    render(<CharacterWritingExercise entry={entry} onNext={onNext} />)
    fireEvent.click(screen.getByText('complete-no-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    expect(onNext).toHaveBeenCalledWith(true)
  })

  it('calls onNext(false) when any char used a hint', () => {
    const onNext = vi.fn()
    render(<CharacterWritingExercise entry={entry} onNext={onNext} />)
    fireEvent.click(screen.getByText('complete-with-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    expect(onNext).toHaveBeenCalledWith(false)
  })

  it('shows meaning and pinyin as prompt', () => {
    render(<CharacterWritingExercise entry={entry} onNext={vi.fn()} />)
    expect(screen.getByText('hello')).toBeTruthy()
    expect(screen.getByText('nǐ hǎo')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/CharacterWritingExercise.test.tsx
```

- [ ] **Step 3: Implement CharacterWritingExercise**

Create `frontend/src/components/study/exercises/CharacterWritingExercise.tsx`:
```tsx
import type { VocabEntry } from '@/types'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { HanziWriterCanvas, animateCharacter } from './HanziWriterCanvas'
import HanziWriter from 'hanzi-writer'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
}

export function CharacterWritingExercise({ entry, progress = '', onNext }: Props) {
  const characters = [...entry.word]
  const [charIndex, setCharIndex] = useState(0)
  const [hintAnimating, setHintAnimating] = useState(false)
  // Use a ref (not state) for anyHintUsed to avoid stale closures in advance().
  // State version is kept only for re-rendering (not for value reads in callbacks).
  const anyHintUsedRef = useRef(false)
  const writerRef = useRef<HanziWriter | null>(null)

  const currentChar = characters[charIndex]
  const charProgress = `${charIndex + 1} / ${characters.length}`

  function handleComplete(usedHint: boolean) {
    if (usedHint) anyHintUsedRef.current = true
    setHintAnimating(false)
    advance()
  }

  function advance() {
    setCharIndex((idx) => {
      const next = idx + 1
      if (next >= characters.length) {
        // Use setTimeout to call onNext outside the setState cycle
        setTimeout(() => onNext(!anyHintUsedRef.current), 0)
        return idx // won't matter — component unmounts or re-renders
      }
      return next
    })
  }

  function handleHint() {
    anyHintUsedRef.current = true
    setHintAnimating(true)
    animateCharacter(writerRef, () => setHintAnimating(false))
  }

  const footer = (
    <div className="flex items-center justify-between px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {hintAnimating
        ? (
            <Button size="sm" onClick={advance}>Continue →</Button>
          )
        : (
            <Button variant="outline" size="sm" onClick={handleHint}>Hint</Button>
          )}
    </div>
  )

  return (
    <ExerciseCard type="Character Writing" progress={progress} footer={footer}>
      {/* Prompt */}
      <div className="text-center mb-4">
        <p className="text-sm text-muted-foreground">{entry.meaning}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{entry.pinyin}</p>
      </div>

      {/* Character progress */}
      <p className="text-xs text-center text-muted-foreground mb-3">{charProgress}</p>

      {/* Canvas */}
      <div className="flex justify-center mb-2">
        <HanziWriterCanvas
          key={`${entry.id}-${charIndex}`}
          character={currentChar}
          writerRef={writerRef}
          onComplete={handleComplete}
        />
      </div>
    </ExerciseCard>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/CharacterWritingExercise.test.tsx
```
Expected: all tests PASS.

- [ ] **Step 5: Run all tests**

```bash
cd frontend && npx vitest run tests/
```
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/study/exercises/CharacterWritingExercise.tsx \
        frontend/tests/CharacterWritingExercise.test.tsx
git commit -m "feat(writing): add CharacterWritingExercise with hanzi-writer stroke grading"
```

---

### Task 9: StudySession + ModePicker integration

**Files:**
- Modify: `frontend/src/components/study/ModePicker.tsx`
- Modify: `frontend/src/components/study/StudySession.tsx`

**Changes to `ModePicker.tsx`:**
1. Add `'writing'` to `ExerciseMode` union
2. Add tile to `MODES` array

**Changes to `StudySession.tsx`:**
1. Import `CharacterWritingExercise` and `isWritingSupported`
2. Add `hasWriting: boolean` param to `distributeExercises`
3. Compute `hasWriting` in `handleStart` before calling `distributeExercises`
4. Add render branch for `q.type === 'writing'`

- [ ] **Step 1: Run existing StudySession tests to establish baseline**

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

- [ ] **Step 2: Update ModePicker.tsx**

```ts
export type ExerciseMode = 'cloze' | 'dictation' | 'pinyin' | 'pronunciation' | 'reconstruction' | 'writing' | 'mixed'

// Add to MODES array:
{ id: 'writing', icon: '✏️', name: 'Write', desc: 'Draw the characters' }
```

- [ ] **Step 3: Update StudySession.tsx**

Add imports at the top:
```ts
import { CharacterWritingExercise } from '@/components/study/exercises/CharacterWritingExercise'
import { isWritingSupported } from '@/lib/hanzi-writer-chars'
```

Update `distributeExercises` signature:
```ts
function distributeExercises(
  entries: VocabEntry[],
  mode: ExerciseMode,
  count: number,
  hasAzure: boolean,
  hasWriting: boolean,
): Exclude<ExerciseMode, 'mixed'>[] {
  const available: Exclude<ExerciseMode, 'mixed'>[] = ['cloze', 'dictation', 'pinyin', 'reconstruction']
  if (hasAzure) available.push('pronunciation')
  if (hasWriting) available.push('writing')
  // ... rest unchanged
```

In `handleStart`, compute `hasWriting` from `entries` before creating `pool`:
```ts
const hasWriting = entries.some(e => isWritingSupported(e.word))
const types = distributeExercises(entries, mode, count, hasAzure, hasWriting)
```

Add render branch in the JSX (after the `reconstruction` branch). Guard against entries whose characters are not supported — skip forward automatically if one appears:

```tsx
{q.type === 'writing' && isWritingSupported(q.entry.word) && (
  <CharacterWritingExercise
    key={current}
    entry={q.entry}
    progress={`${current + 1} / ${questions.length}`}
    onNext={handleNext}
  />
)}
{q.type === 'writing' && !isWritingSupported(q.entry.word) && (
  // Unsupported entry slipped through — skip it automatically.
  // This can happen in mixed mode if the pool had some supported and some unsupported entries.
  <>{handleNext(false)}</>
)}
```

**Note:** The auto-skip `<>{handleNext(false)}</>` pattern calls `handleNext` during render. This is an anti-pattern in React. A cleaner alternative is to add a `useEffect` in `StudySession` that auto-advances if the current question is a writing type with an unsupported word. Either approach works; the implementer can choose. The `useEffect` approach is preferred:

```tsx
// In StudySession, add:
useEffect(() => {
  if (q?.type === 'writing' && !isWritingSupported(q.entry.word)) {
    handleNext(false)
  }
}, [current]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Run all tests**

```bash
cd frontend && npx vitest run tests/
```
Expected: all PASS.

- [ ] **Step 5: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/study/ModePicker.tsx \
        frontend/src/components/study/StudySession.tsx
git commit -m "feat(writing): integrate CharacterWritingExercise into StudySession"
```

---

## Done

Both features are implemented and integrated. Manual smoke-test checklist:

- [ ] Open a lesson → Start Study Session → Select "Dictation" → type pinyin → candidates appear → select with Space → correct hanzi inserted
- [ ] Open a lesson → Start Study Session → Select "Cloze" → type in blanks → candidates work inside story text
- [ ] Open a Shadowing session → Dictation mode → type using pinyin IME → reveal phase shows char diff (not pinyin diff)
- [ ] Open a lesson → Start Study Session → Select "Write" → canvas appears → draw strokes → correct strokes snap into place → exercise completes
- [ ] Mixed mode includes Writing exercises for lessons with CJK vocabulary
