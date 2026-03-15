# Download Media Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download audio/video" icon button to the VideoPanel header that saves the lesson's media blob from IndexedDB to the user's filesystem.

**Architecture:** All logic lives in `VideoPanel.tsx`. Two pure helper functions handle filename generation (`sanitizeBaseName`, `getMimeExtension`); both are exported for testability. `handleDownload` is a `useCallback` that creates an object URL, triggers a hidden `<a>` click, and defers URL revocation by 100ms.

**Tech Stack:** React, TypeScript, lucide-react (`Download` icon), `@/components/ui/button`, `@/components/ui/tooltip` (with `TooltipProvider` per the codebase pattern)

**Spec:** `docs/superpowers/specs/2026-03-15-download-media-design.md`

---

## Chunk 1: Helpers + download logic (TDD)

### Task 1: Export pure helper functions from VideoPanel

**Files:**
- Modify: `frontend/src/components/lesson/VideoPanel.tsx`

These two functions have no side effects, so they are easy to unit-test in isolation. Export them from `VideoPanel.tsx` so tests can import directly.

- [ ] **Step 1: Add `sanitizeBaseName` export to `VideoPanel.tsx`**

Add after the existing `extractYouTubeVideoId` function (around line 30):

```ts
export function sanitizeBaseName(title: string): string {
  const sanitized = title
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return sanitized || 'lesson'
}
```

- [ ] **Step 2: Add `getMimeExtension` export to `VideoPanel.tsx`**

Add immediately after `sanitizeBaseName`:

```ts
const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
}

export function getMimeExtension(mimeType: string): string {
  const base = mimeType.split(';')[0].trim()
  return MIME_TO_EXT[base] ?? '.mp4'
}
```

---

### Task 2: Write and run unit tests for the helpers (TDD)

**Files:**
- Create: `frontend/tests/VideoPanel.helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/VideoPanel.helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getMimeExtension, sanitizeBaseName } from '../src/components/lesson/VideoPanel'

describe('sanitizeBaseName', () => {
  it('replaces spaces with hyphens', () => {
    expect(sanitizeBaseName('My Lesson')).toBe('My-Lesson')
  })

  it('strips characters outside [a-zA-Z0-9._-]', () => {
    expect(sanitizeBaseName('Hello! World#$')).toBe('Hello-World')
  })

  it('trims leading and trailing hyphens', () => {
    expect(sanitizeBaseName('!My Lesson!')).toBe('My-Lesson')
  })

  it('truncates to 100 chars (base name only)', () => {
    const long = 'a'.repeat(150)
    expect(sanitizeBaseName(long)).toHaveLength(100)
  })

  it('falls back to "lesson" for empty result', () => {
    expect(sanitizeBaseName('!!!###')).toBe('lesson')
    expect(sanitizeBaseName('')).toBe('lesson')
  })
})

describe('getMimeExtension', () => {
  it('maps video/mp4 to .mp4', () => {
    expect(getMimeExtension('video/mp4')).toBe('.mp4')
  })

  it('maps video/webm to .webm', () => {
    expect(getMimeExtension('video/webm')).toBe('.webm')
  })

  it('maps video/quicktime to .mov', () => {
    expect(getMimeExtension('video/quicktime')).toBe('.mov')
  })

  it('maps video/x-msvideo to .avi', () => {
    expect(getMimeExtension('video/x-msvideo')).toBe('.avi')
  })

  it('strips codec suffix before lookup', () => {
    expect(getMimeExtension('video/mp4; codecs=avc1')).toBe('.mp4')
  })

  it('falls back to .mp4 for unknown types', () => {
    expect(getMimeExtension('video/unknown')).toBe('.mp4')
    expect(getMimeExtension('')).toBe('.mp4')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (functions not yet in file)**

```bash
cd frontend && npx vitest run tests/VideoPanel.helpers.test.ts
```

Expected: tests fail because exports don't exist yet.

- [ ] **Step 3: Confirm helpers are now in VideoPanel.tsx (from Task 1)**

The exports were added in Task 1. Run tests again:

```bash
cd frontend && npx vitest run tests/VideoPanel.helpers.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit helpers + tests**

```bash
cd frontend && git add src/components/lesson/VideoPanel.tsx tests/VideoPanel.helpers.test.ts
git commit -m "feat: add sanitizeBaseName and getMimeExtension helpers to VideoPanel"
```

---

## Chunk 2: UI — download button in VideoPanel header

> **Prerequisite:** Chunk 1 must be complete. `sanitizeBaseName` and `getMimeExtension` are exported from `VideoPanel.tsx` and tested by `tests/VideoPanel.helpers.test.ts`.

### Task 3: Add the download button

**Files:**
- Modify: `frontend/src/components/lesson/VideoPanel.tsx`

- [ ] **Step 1: Add imports**

Update the lucide-react import line (line 2) — add `Download`:

```ts
import { Download, ExternalLink, Home, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
```

Update the React import line (line 3) — add `useCallback`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
```

Add tooltip imports after the `Button` import (after line 6):

```ts
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
```

- [ ] **Step 2: Add `handleDownload` callback**

Add after the `handleScrub` function (after line 126):

```ts
const handleDownload = useCallback(() => {
  if (!videoBlob)
    return
  const ext = lesson.source === 'youtube' ? '.mp3' : getMimeExtension(videoBlob.type)
  const filename = sanitizeBaseName(lesson.title) + ext
  const objectUrl = URL.createObjectURL(videoBlob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
}, [videoBlob, lesson.title, lesson.source])
```

- [ ] **Step 3: Add download button to the header**

Replace the header JSX (lines 131–139):

```tsx
{/* Header */}
<div className="flex items-center gap-2 border-b border-border px-3 py-2">
  <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
    <Home className="size-4" />
  </Button>
  <div className="h-4 w-px bg-border" />
  <span className="truncate text-sm font-medium text-foreground">
    {lesson.title}
  </span>
  {videoBlob && (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0"
            onClick={handleDownload}
          >
            <Download className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {lesson.source === 'youtube' ? 'Download audio' : 'Download video'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )}
</div>
```

- [ ] **Step 4: Re-run helpers tests to confirm no regressions**

```bash
cd frontend && npx vitest run tests/VideoPanel.helpers.test.ts
```

Expected: all pass.

- [ ] **Step 5: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Lint**

```bash
cd frontend && npx eslint src/components/lesson/VideoPanel.tsx
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/components/lesson/VideoPanel.tsx
git commit -m "feat: add download audio/video button to VideoPanel header"
```

---

## Manual Verification Checklist

After both chunks are complete, verify in the browser (`npm run dev` from `frontend/`):

- [ ] Open a YouTube lesson — header shows a download icon button (right side)
- [ ] Hover the button — tooltip reads "Download audio"
- [ ] Click it — browser saves a `.mp3` file named after the lesson title
- [ ] Open an uploaded video lesson — tooltip reads "Download video"
- [ ] Click it — browser saves a `.mp4` (or correct ext) file named after the lesson title
- [ ] Open a lesson with no stored media (if any exist) — download button is not rendered
