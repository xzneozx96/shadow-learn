# Volume Control Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a volume slider to the VideoPanel controls bar so users can boost or lower playback volume.

**Architecture:** Add `setVolume` to the shared `VideoPlayer` interface, implement it in both player classes, expose `volume` state through `PlayerContext`, and render a controlled range slider in `VideoPanel`.

**Tech Stack:** React 19, TypeScript, Vitest + jsdom, Lucide React v0.577.0

**Spec:** `docs/superpowers/specs/2026-03-15-volume-control-design.md`

---

## Chunk 1: Player interface + HTML5Player

### Task 1: Add `setVolume` to `VideoPlayer` interface

**Files:**
- Modify: `frontend/src/player/types.ts`

- [ ] **Step 1: Add `setVolume` to the interface**

Open `frontend/src/player/types.ts`. Add one line after `setPlaybackRate`:

```ts
export interface VideoPlayer {
  play: () => void
  pause: () => void
  seekTo: (seconds: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  setPlaybackRate: (rate: number) => void
  setVolume: (volume: number) => void   // ← add this
  onTimeUpdate: (callback: (currentTime: number) => void) => () => void
  onEnded: (callback: () => void) => () => void
  onPlay: (callback: () => void) => () => void
  onPause: (callback: () => void) => () => void
  destroy: () => void
}
```

- [ ] **Step 2: Verify TypeScript catches missing implementations**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep setVolume
```

Expected: errors for `HTML5Player` and `YouTubePlayer` not implementing `setVolume`.

---

### Task 2: Implement `setVolume` in `HTML5Player` + widen constructor type

**Files:**
- Modify: `frontend/src/player/HTML5Player.ts`
- Create: `frontend/tests/HTML5Player.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/HTML5Player.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HTML5Player } from '../src/player/HTML5Player'

function makeAudio(): HTMLAudioElement {
  const el = document.createElement('audio')
  // jsdom sets volume to 1 by default
  return el
}

describe('HTML5Player.setVolume', () => {
  it('sets volume on the element', () => {
    const el = makeAudio()
    const player = new HTML5Player(el)
    player.setVolume(0.5)
    expect(el.volume).toBe(0.5)
    player.destroy()
  })

  it('clamps values above 1 to 1', () => {
    const el = makeAudio()
    const player = new HTML5Player(el)
    player.setVolume(1.5)
    expect(el.volume).toBe(1)
    player.destroy()
  })

  it('clamps values below 0 to 0', () => {
    const el = makeAudio()
    const player = new HTML5Player(el)
    player.setVolume(-0.1)
    expect(el.volume).toBe(0)
    player.destroy()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run tests/HTML5Player.test.ts
```

Expected: FAIL — `HTML5Player` does not implement `setVolume`.

- [ ] **Step 3: Implement `setVolume` + widen constructor type in `HTML5Player`**

In `frontend/src/player/HTML5Player.ts`:

1. Change the `element` field type and constructor signature:

```ts
// Before:
private element: HTMLVideoElement

constructor(element: HTMLVideoElement) {

// After:
private element: HTMLVideoElement | HTMLAudioElement

constructor(element: HTMLVideoElement | HTMLAudioElement) {
```

2. Add `setVolume` after `setPlaybackRate`:

```ts
setVolume(volume: number): void {
  this.element.volume = Math.max(0, Math.min(1, volume))
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend && npx vitest run tests/HTML5Player.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/player/types.ts src/player/HTML5Player.ts tests/HTML5Player.test.ts && git commit -m "feat: add setVolume to VideoPlayer interface and HTML5Player"
```

---

## Chunk 2: YouTubePlayer

### Task 3: Implement `setVolume` in `YouTubePlayer`

**Files:**
- Modify: `frontend/src/player/YouTubePlayer.ts`

The YouTube IFrame API uses a 0–100 integer scale. `YouTubePlayer` is not actively used in `VideoPanel` today, but it must satisfy the `VideoPlayer` interface.

No automated test is written for `YouTubePlayer` — its constructor requires the live YouTube IFrame API which cannot load in jsdom. Correctness is verified by TypeScript compilation.

- [ ] **Step 1: Add `setVolume` to `YouTubePlayer`**

In `frontend/src/player/YouTubePlayer.ts`, add after `setPlaybackRate`:

```ts
setVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume))
  this.player?.setVolume(Math.round(clamped * 100))
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep setVolume
```

Expected: no output — `setVolume` errors are gone. (Unrelated pre-existing errors, if any, will not mention `setVolume` and can be ignored here.)

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/player/YouTubePlayer.ts && git commit -m "feat: implement setVolume in YouTubePlayer"
```

---

## Chunk 3: PlayerContext

### Task 4: Add `volume` state and `setVolume` to `PlayerContext`

**Files:**
- Modify: `frontend/src/contexts/PlayerContext.tsx`
- Create: `frontend/tests/PlayerContext.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/PlayerContext.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlayerProvider, usePlayer } from '../src/contexts/PlayerContext'
import type { VideoPlayer } from '../src/player/types'

function makePlayer(overrides: Partial<VideoPlayer> = {}): VideoPlayer {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 0),
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
    onTimeUpdate: vi.fn(() => () => {}),
    onEnded: vi.fn(() => () => {}),
    onPlay: vi.fn(() => () => {}),
    onPause: vi.fn(() => () => {}),
    destroy: vi.fn(),
    ...overrides,
  }
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PlayerProvider>{children}</PlayerProvider>
)

describe('PlayerContext volume', () => {
  it('initializes volume to 1', () => {
    const { result } = renderHook(() => usePlayer(), { wrapper })
    expect(result.current.volume).toBe(1)
  })

  it('setVolume updates state and calls player.setVolume', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => { result.current.setPlayer(player) })
    act(() => { result.current.setVolume(0.4) })

    expect(result.current.volume).toBe(0.4)
    expect(player.setVolume).toHaveBeenCalledWith(0.4)
  })

  it('setVolume clamps values above 1', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => { result.current.setPlayer(player) })
    act(() => { result.current.setVolume(2) })

    expect(result.current.volume).toBe(1)
    expect(player.setVolume).toHaveBeenCalledWith(1)
  })

  it('setVolume clamps values below 0', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => { result.current.setPlayer(player) })
    act(() => { result.current.setVolume(-0.5) })

    expect(result.current.volume).toBe(0)
    expect(player.setVolume).toHaveBeenCalledWith(0)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run tests/PlayerContext.test.tsx
```

Expected: FAIL — `volume` and `setVolume` not in context.

- [ ] **Step 3: Update `PlayerContext`**

In `frontend/src/contexts/PlayerContext.tsx`:

1. Add `volume` and `setVolume` to the `PlayerState` interface:

Replace the entire `PlayerState` interface with this (additions marked with `← add`):

```ts
interface PlayerState {
  player: VideoPlayer | null
  currentTime: number
  playbackRate: number
  volume: number                          // ← add
  setPlayer: (player: VideoPlayer) => void
  setPlaybackRate: (rate: number) => void
  setVolume: (v: number) => void          // ← add
}
```

Do NOT remove `setPlayer` — it is already present in the interface and must remain.

2. Add the `volume` state variable inside `PlayerProvider` (after `playbackRate_`):

```ts
const [volume, setVolume_] = useState(1)
```

3. Add the `setVolume` callback inside `PlayerProvider` (after `setPlaybackRate`):

```ts
const setVolume = useCallback(
  (v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    player?.setVolume(clamped)
    setVolume_(clamped)
  },
  [player],
)
```

4. Add `volume` and `setVolume` to the context value:

```ts
return (
  <PlayerContext
    value={{ player, currentTime, playbackRate, volume, setPlayer, setPlaybackRate, setVolume }}
  >
    {children}
  </PlayerContext>
)
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend && npx vitest run tests/PlayerContext.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Confirm all tests still pass**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/contexts/PlayerContext.tsx tests/PlayerContext.test.tsx && git commit -m "feat: add volume state to PlayerContext"
```

---

## Chunk 4: VideoPanel UI

### Task 5: Add volume slider to `VideoPanel`

**Files:**
- Modify: `frontend/src/components/lesson/VideoPanel.tsx`
- Create: `frontend/tests/VideoPanel.volume.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/VideoPanel.volume.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoPanel } from '../src/components/lesson/VideoPanel'
import type { LessonMeta } from '../src/types'

// Mock PlayerContext so we control volume/setVolume
const mockSetVolume = vi.fn()
vi.mock('../src/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    player: null,
    currentTime: 0,
    playbackRate: 1,
    volume: 0.8,
    setPlayer: vi.fn(),
    setPlaybackRate: vi.fn(),
    setVolume: mockSetVolume,
  }),
}))

// Mock react-router-dom Link (VideoPanel uses it for the Home button)
vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

const lesson: LessonMeta = {
  id: '1',
  title: 'Test Lesson',
  source: 'upload',
  sourceUrl: null,
  duration: 120,
  segmentCount: 3,
  translationLanguages: ['en'],
  createdAt: '2026-01-01',
  lastOpenedAt: '2026-01-01',
  progressSegmentId: null,
  tags: [],
}

// Find the volume slider by its unique combination of max="1" and step="0.05".
// The scrubber has max equal to the video duration (0 when no player), making it distinct.
function getVolumeSlider(): HTMLInputElement {
  const sliders = document.querySelectorAll('input[type="range"]')
  const el = Array.from(sliders).find(
    s => s.getAttribute('max') === '1' && s.getAttribute('step') === '0.05',
  )
  if (!el) throw new Error('Volume slider not found')
  return el as HTMLInputElement
}

describe('VideoPanel volume slider', () => {
  it('renders with the current volume value from context', () => {
    render(<VideoPanel lesson={lesson} segments={[]} activeSegment={null} />)
    const slider = getVolumeSlider()
    expect(slider.value).toBe('0.8')
  })

  it('calls setVolume with a rounded value on change', () => {
    render(<VideoPanel lesson={lesson} segments={[]} activeSegment={null} />)
    const slider = getVolumeSlider()
    fireEvent.change(slider, { target: { value: '0.6' } })
    expect(mockSetVolume).toHaveBeenCalledWith(0.6)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run tests/VideoPanel.volume.test.tsx
```

Expected: FAIL — `volume` is not destructured from `usePlayer` in `VideoPanel` yet, so the slider is absent.

- [ ] **Step 3: Add `Volume2` import**

In `frontend/src/components/lesson/VideoPanel.tsx`, add `Volume2` to the lucide-react import:

```ts
// Before:
import { ExternalLink, Home, Pause, Play, SkipBack, SkipForward } from 'lucide-react'

// After:
import { ExternalLink, Home, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
```

- [ ] **Step 4: Destructure `volume` and `setVolume` from `usePlayer`**

On line 39, update the destructure:

```ts
// Before:
const { player, currentTime, playbackRate, setPlayer, setPlaybackRate } = usePlayer()

// After:
const { player, currentTime, playbackRate, volume, setPlayer, setPlaybackRate, setVolume } = usePlayer()
```

- [ ] **Step 5: Add `handleVolumeChange` handler**

Add this function after `handleScrub` (around line 126):

```ts
const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setVolume(Math.round(Number(e.target.value) * 100) / 100)
}
```

- [ ] **Step 6: Drop the unsafe audio ref cast**

The `HTML5Player` constructor now accepts `HTMLVideoElement | HTMLAudioElement`, so the cast on the audio element construction site can be removed. Find the line that constructs `HTML5Player` (around line 56):

```ts
// Before:
const h5Player = new HTML5Player(mediaRef.current as HTMLVideoElement)

// After:
const h5Player = new HTML5Player(mediaRef.current)
```

- [ ] **Step 7: Add the volume slider to the transport controls row**

In the transport controls row (the `<div className="flex items-center justify-between">` around line 194), add the volume widget as a new rightmost group. The row currently has three sections; add a fourth:

```tsx
{/* Volume */}
<div className="flex items-center gap-1.5">
  <Volume2 className="size-4 shrink-0 text-muted-foreground" />
  <input
    type="range"
    min={0}
    max={1}
    step={0.05}
    value={volume}
    onChange={handleVolumeChange}
    className="h-1 w-20 cursor-pointer accent-primary"
  />
</div>
```

Place this after the playback rate `<div>`, still inside the `justify-between` flex container. The full transport row should look like:

```tsx
<div className="flex items-center justify-between">
  {/* Transport buttons */}
  <div className="flex items-center gap-1">
    ...SkipBack, Play/Pause, SkipForward...
  </div>

  {/* Time display */}
  <span className="font-mono text-sm text-muted-foreground">
    {formatTime(currentTime)} / {formatTime(duration)}
  </span>

  {/* Playback rate */}
  <div className="flex items-center gap-0.5">
    ...rate buttons...
  </div>

  {/* Volume */}
  <div className="flex items-center gap-1.5">
    <Volume2 className="size-4 shrink-0 text-muted-foreground" />
    <input
      type="range"
      min={0}
      max={1}
      step={0.05}
      value={volume}
      onChange={handleVolumeChange}
      className="h-1 w-20 cursor-pointer accent-primary"
    />
  </div>
</div>
```

- [ ] **Step 8: Run the VideoPanel test to confirm it passes**

```bash
cd frontend && npx vitest run tests/VideoPanel.volume.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 9: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Run all tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 11: Smoke test in browser**

```bash
cd frontend && npm run dev
```

Open a lesson. Verify:
- Volume slider appears to the right of the playback rate buttons
- Dragging the slider changes audio volume
- Slider position is controlled (reflects current `volume` state)

- [ ] **Step 12: Commit**

```bash
cd frontend && git add src/components/lesson/VideoPanel.tsx tests/VideoPanel.volume.test.tsx && git commit -m "feat: add volume slider to VideoPanel controls"
```
