# Lesson Workbook Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Workbook" tab to the right-side CompanionPanel in the lesson view, showing vocabulary saved from the current lesson with a 2-column word grid and a one-tap path to study.

**Architecture:** `LessonView` passes `lessonId` to `CompanionPanel`, which gains a `<Tabs variant="line">` bar switching between the existing AI Companion content and a new `LessonWorkbookPanel`. `LessonWorkbookPanel` calls `useVocabulary()` independently to render the word grid and a pinned Study button.

**Tech Stack:** React 18, TypeScript, `@base-ui/react/tabs` (via `@/components/ui/tabs`), Tailwind CSS, Vitest + `@testing-library/react`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/lesson/LessonWorkbookPanel.tsx` | **Create** | 2-col word grid, sub-header count + "View all" link, pinned Study button |
| `frontend/src/components/lesson/CompanionPanel.tsx` | **Modify** | Add `lessonId` prop; replace header with `<Tabs variant="line">`; call `useVocabulary()` for badge |
| `frontend/src/components/lesson/LessonView.tsx` | **Modify** | Pass `lessonId={id ?? ''}` to `<CompanionPanel>` |
| `frontend/tests/LessonWorkbookPanel.test.tsx` | **Create** | Unit tests for all panel states and interactions |
| `frontend/tests/CompanionPanel.workbook.test.tsx` | **Create** | Tests for tab bar rendering and badge count |

**Dependency note:** Task 2 (CompanionPanel) adds a required `lessonId` prop; Task 3 (LessonView) supplies it. Complete both before committing — they are committed together at the end of Task 2.

---

## Task 1: `LessonWorkbookPanel` component

**Files:**
- Create: `frontend/src/components/lesson/LessonWorkbookPanel.tsx`
- Create: `frontend/tests/LessonWorkbookPanel.test.tsx`

---

- [ ] **Step 1.1 — Write the failing test**

Create `frontend/tests/LessonWorkbookPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null }),
}))

// Render tooltip content inline — no hover / portal required in jsdom
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

type MockEntry = {
  id: string
  word: string
  pinyin: string
  meaning: string
  sourceLessonId: string
  sourceSegmentId: string
}

const mockEntries: MockEntry[] = [
  { id: 'e1', word: '今天', pinyin: 'jīntiān', meaning: 'today', sourceLessonId: 'lesson_1', sourceSegmentId: 'seg_1' },
  { id: 'e2', word: '朋友', pinyin: 'péngyou', meaning: 'friend', sourceLessonId: 'lesson_1', sourceSegmentId: 'seg_2' },
]

let mockVocab: { entriesByLesson: Record<string, MockEntry[]> } = { entriesByLesson: {} }

vi.mock('@/hooks/useVocabulary', () => ({
  useVocabulary: () => mockVocab,
}))

// Import after mocks are hoisted
import { LessonWorkbookPanel } from '@/components/lesson/LessonWorkbookPanel'

describe('LessonWorkbookPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVocab = { entriesByLesson: {} }
  })

  it('shows empty-state message when no words saved', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText(/tap the bookmark/i)).toBeTruthy()
  })

  it('shows "0 words saved" in sub-header', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('0 words saved')).toBeTruthy()
  })

  it('shows word cards when entries exist for the lesson', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('今天')).toBeTruthy()
    expect(screen.getByText('朋友')).toBeTruthy()
  })

  it('shows correct word count in sub-header', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('2 words saved')).toBeTruthy()
  })

  it('shows "1 word saved" (singular) for exactly one entry', () => {
    mockVocab = { entriesByLesson: { lesson_1: [mockEntries[0]] } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('1 word saved')).toBeTruthy()
  })

  it('navigates to lesson segment on word card click', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    // The character text is inside the button — click the button element
    const btn = screen.getByText('今天').closest('button')!
    fireEvent.click(btn)
    expect(mockNavigate).toHaveBeenCalledWith('/lesson/lesson_1?segmentId=seg_1')
  })

  it('Study button is disabled when no words saved', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByRole('button', { name: /study this lesson/i })).toBeDisabled()
  })

  it('shows tooltip text when Study button is disabled', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('Save at least one word first')).toBeTruthy()
  })

  it('Study button is enabled when words exist', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByRole('button', { name: /study this lesson/i })).not.toBeDisabled()
  })

  it('Study button navigates to study session on click', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/vocabulary/lesson_1/study')
  })

  it('does not show entries for a different lessonId', () => {
    mockVocab = { entriesByLesson: { other_lesson: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.queryByText('今天')).toBeNull()
  })
})
```

---

- [ ] **Step 1.2 — Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/LessonWorkbookPanel.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '@/components/lesson/LessonWorkbookPanel'`

---

- [ ] **Step 1.3 — Implement `LessonWorkbookPanel`**

Create `frontend/src/components/lesson/LessonWorkbookPanel.tsx`:

```tsx
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useVocabulary } from '@/hooks/useVocabulary'

interface LessonWorkbookPanelProps {
  lessonId: string
}

export function LessonWorkbookPanel({ lessonId }: LessonWorkbookPanelProps) {
  const { entriesByLesson } = useVocabulary()
  const navigate = useNavigate()
  const entries = entriesByLesson[lessonId] ?? []
  const count = entries.length

  return (
    <div className="flex h-full flex-col">
      {/* Sub-header: count + "View all" link */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm text-muted-foreground">
          {count} {count === 1 ? 'word' : 'words'} saved
        </span>
        <Link
          to="/vocabulary"
          className="text-sm text-foreground transition-colors hover:text-foreground/70"
        >
          View all →
        </Link>
      </div>

      {/* Word grid or empty state */}
      {count === 0
        ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Hover any word in the transcript and tap the bookmark to save it here
              </p>
            </div>
          )
        : (
            <ScrollArea className="min-h-0 flex-1 p-3">
              <div className="grid grid-cols-2 gap-2">
                {entries.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() =>
                      navigate(`/lesson/${lessonId}?segmentId=${entry.sourceSegmentId}`)}
                    className="cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <p className="text-2xl font-bold text-foreground">{entry.word}</p>
                    <p className="text-sm text-muted-foreground">{entry.pinyin}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground/70">{entry.meaning}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

      {/* Study button — pinned to bottom */}
      <div className="border-t border-border p-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span wrapper required: disabled buttons don't fire hover events */}
              <span className="block w-full">
                <Button
                  className="w-full"
                  disabled={count === 0}
                  onClick={() => navigate(`/vocabulary/${lessonId}/study`)}
                >
                  Study This Lesson →
                </Button>
              </span>
            </TooltipTrigger>
            {count === 0 && (
              <TooltipContent>Save at least one word first</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
```

---

- [ ] **Step 1.4 — Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/LessonWorkbookPanel.test.tsx 2>&1 | tail -20
```

Expected: 11 tests pass

---

- [ ] **Step 1.5 — Commit**

```bash
git add frontend/src/components/lesson/LessonWorkbookPanel.tsx frontend/tests/LessonWorkbookPanel.test.tsx
git commit -m "feat: add LessonWorkbookPanel with word grid and study button"
```

---

## Task 2: `CompanionPanel` tab bar + `LessonView` prop

**Files:**
- Modify: `frontend/src/components/lesson/CompanionPanel.tsx`
- Modify: `frontend/src/components/lesson/LessonView.tsx`
- Create: `frontend/tests/CompanionPanel.workbook.test.tsx`

These two files are committed together because `CompanionPanel` gains a required `lessonId` prop that `LessonView` must supply.

---

- [ ] **Step 2.1 — Write the failing test**

Create `frontend/tests/CompanionPanel.workbook.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock useVocabulary as vi.fn so individual tests can override return value
vi.mock('@/hooks/useVocabulary', () => ({
  useVocabulary: vi.fn(() => ({ entriesByLesson: {} })),
}))

// Avoid rendering LessonWorkbookPanel internals in these tab-bar tests
vi.mock('@/components/lesson/LessonWorkbookPanel', () => ({
  LessonWorkbookPanel: ({ lessonId }: { lessonId: string }) => (
    <div data-testid="workbook-panel">{lessonId}</div>
  ),
}))

// Import after mocks are hoisted
import { useVocabulary } from '@/hooks/useVocabulary'
import { CompanionPanel } from '@/components/lesson/CompanionPanel'

const defaultProps = {
  messages: [],
  isStreaming: false,
  onSend: vi.fn(),
  activeSegment: null,
  model: 'gpt-4o-mini',
  onModelChange: vi.fn(),
  lessonId: 'lesson_1',
}

describe('CompanionPanel — tab bar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useVocabulary).mockReturnValue({ entriesByLesson: {} } as ReturnType<typeof useVocabulary>)
  })

  it('renders "AI Companion" tab trigger', () => {
    render(<CompanionPanel {...defaultProps} />)
    expect(screen.getByText('AI Companion')).toBeTruthy()
  })

  it('renders "Workbook" tab trigger', () => {
    render(<CompanionPanel {...defaultProps} />)
    expect(screen.getByText('Workbook')).toBeTruthy()
  })

  it('does not show a badge when no words are saved for this lesson', () => {
    render(<CompanionPanel {...defaultProps} />)
    // Badge should not be present (count is 0)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows badge with count when words are saved for this lesson', () => {
    vi.mocked(useVocabulary).mockReturnValue({
      entriesByLesson: {
        lesson_1: [
          { id: 'e1', word: '今天' } as never,
          { id: 'e2', word: '朋友' } as never,
        ],
      },
    } as ReturnType<typeof useVocabulary>)
    render(<CompanionPanel {...defaultProps} />)
    expect(screen.getByText('2')).toBeTruthy()
  })
})
```

---

- [ ] **Step 2.2 — Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/CompanionPanel.workbook.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `lessonId` prop type error and no tab triggers found

---

- [ ] **Step 2.3 — Rewrite `CompanionPanel.tsx`**

Replace the full contents of `frontend/src/components/lesson/CompanionPanel.tsx`:

```tsx
import type { ChatMessage, Segment } from '@/types'
import { Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useVocabulary } from '@/hooks/useVocabulary'
import { cn } from '@/lib/utils'
import { LessonWorkbookPanel } from './LessonWorkbookPanel'

interface CompanionPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  onSend: (content: string) => void
  activeSegment: Segment | null
  model: string
  onModelChange: (model: string) => void
  lessonId: string
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  )
}

export function CompanionPanel({
  messages,
  isStreaming,
  onSend,
  activeSegment,
  lessonId,
}: CompanionPanelProps) {
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<'ai' | 'workbook'>('ai')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { entriesByLesson } = useVocabulary()
  const count = (entriesByLesson[lessonId] ?? []).length

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming)
      return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col bg-background/10 backdrop-blur-md">
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as 'ai' | 'workbook')}
        className="flex h-full flex-col gap-0"
      >
        <TabsList variant="line" className="w-full shrink-0 border-b border-border px-3">
          <TabsTrigger value="ai">AI Companion</TabsTrigger>
          <TabsTrigger value="workbook" className="gap-1.5">
            Workbook
            {count > 0 && (
              <Badge className="px-1.5 py-0 text-[10px]">{count}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* AI Companion tab */}
        <TabsContent value="ai" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeSegment && (
            <div className="border-b border-border px-3 py-1.5">
              <Badge variant="outline" className="max-w-full truncate text-sm">
                {activeSegment.chinese}
              </Badge>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1 px-3 py-2">
            {messages.length === 0 && !isStreaming && (
              <div className="flex h-full items-center justify-center py-12">
                <p className="text-center text-sm text-muted-foreground">
                  Ask about vocabulary, grammar, or pronunciation for any segment.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground',
                    )}
                  >
                    {msg.role === 'assistant'
                      ? (
                          <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/50">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )
                      : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                  </div>
                </div>
              ))}

              {isStreaming && messages.at(-1)?.role !== 'assistant' && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <StreamingDots />
                  </div>
                </div>
              )}
            </div>

            <div ref={bottomRef} className="h-px" />
          </ScrollArea>

          <div className="flex items-center gap-2 border-t border-border p-3">
            <Textarea
              placeholder="Ask about this segment..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="min-h-8 resize-none"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </TabsContent>

        {/* Workbook tab */}
        <TabsContent value="workbook" className="min-h-0 flex-1 overflow-hidden">
          <LessonWorkbookPanel lessonId={lessonId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

---

- [ ] **Step 2.4 — Update `LessonView.tsx`**

In `frontend/src/components/lesson/LessonView.tsx`, add `lessonId={id ?? ''}` to the `<CompanionPanel>` JSX (currently around line 152):

```tsx
        <CompanionPanel
          messages={messages}
          isStreaming={isStreaming}
          onSend={sendMessage}
          activeSegment={activeSegment}
          model={model}
          onModelChange={setModel}
          lessonId={id ?? ''}
        />
```

---

- [ ] **Step 2.5 — Run CompanionPanel tab tests**

```bash
cd frontend && npx vitest run tests/CompanionPanel.workbook.test.tsx 2>&1 | tail -20
```

Expected: 4 tests pass

---

- [ ] **Step 2.6 — Run full test suite**

```bash
cd frontend && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass — no regressions

---

- [ ] **Step 2.7 — Commit both files together**

```bash
git add \
  frontend/src/components/lesson/CompanionPanel.tsx \
  frontend/src/components/lesson/LessonView.tsx \
  frontend/tests/CompanionPanel.workbook.test.tsx
git commit -m "feat: add Workbook tab to CompanionPanel, thread lessonId from LessonView"
```
