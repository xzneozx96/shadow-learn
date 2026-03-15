# Volume Control — Design Spec

**Date:** 2026-03-15

## Summary

Add a volume slider to the video player controls bar so users can boost or lower audio level without leaving the app.

## Scope

- Slider only, no mute toggle
- Affects both player implementations: `HTML5Player` and `YouTubePlayer`
- Volume range: 0–1 (0% to 100%), default 1 (full volume)
- Note: `VideoPanel` currently uses `HTML5Player` for all playback (uploaded video via `<video>`, YouTube audio via `<audio>`). `YouTubePlayer` is updated for interface compliance but not actively used in VideoPanel at this time.

## Player Layer (`types.ts`)

Add one method to the `VideoPlayer` interface:

```ts
setVolume(volume: number): void  // volume in [0, 1]
```

## Implementation per player

**`HTML5Player`**

Widen the constructor parameter from `HTMLVideoElement` to `HTMLVideoElement | HTMLAudioElement`. Currently `VideoPanel` passes audio elements via an unsafe `as HTMLVideoElement` cast; widening the type allows the cast to be dropped and makes the code sound.

```ts
constructor(element: HTMLVideoElement | HTMLAudioElement)

setVolume(volume: number): void {
  this.element.volume = Math.max(0, Math.min(1, volume))
}
```

Clamp to [0, 1] to prevent `DOMException` from out-of-range values.

**`YouTubePlayer`**

```ts
setVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume))
  this.player?.setVolume(Math.round(clamped * 100))
}
```

Clamp then round to integer: YouTube IFrame API uses 0–100 integer scale.

## State (`PlayerContext`)

Add `volume` and `setVolume` to `PlayerState`:

```ts
volume: number           // [0, 1], default 1
setVolume: (v: number) => void
```

`setVolume` is a `useCallback` with `[player]` in its dependency array (same pattern as `setPlaybackRate`). It clamps `v` to [0, 1], then calls `player?.setVolume(clamped)` and updates state. Rounding (to avoid floating-point artifacts) is handled in the UI `onChange` handler before calling `setVolume`, so `PlayerContext` only needs to clamp:

```ts
const setVolume = useCallback((v: number) => {
  const clamped = Math.max(0, Math.min(1, v))
  player?.setVolume(clamped)
  setVolume_(clamped)
}, [player])
```

Include `volume` and `setVolume` in the `<PlayerContext value={...}>` prop alongside the existing fields.

**Known limitation:** When a new player is registered via `setPlayer` (e.g. navigating between lessons), the new player resets to browser-default volume (1.0) regardless of the current `volume` state. This is the same behaviour as `playbackRate` and is out of scope for this change.

## UI (`VideoPanel`)

Location: right end of the transport controls row, after the playback rate buttons.

Controls row layout (left → right):
```
[SkipBack][Play][SkipForward]   0:00 / 5:30   [0.5x]…[1.5x]   🔊 ──●──
```

The volume widget:
- Import `Volume2` from `lucide-react` (confirmed present in v0.577.0)
- `<Volume2 className="size-4 shrink-0 text-muted-foreground" />` — visual label only, not interactive
- Controlled slider: `<input type="range" min={0} max={1} step={0.05} value={volume} onChange={handleVolumeChange}>`
  - `w-20`, `accent-primary` to match scrubber style
- `onChange` handler: round to 2 decimal places before calling `setVolume`, to avoid floating-point imprecision from browser step arithmetic:
  ```ts
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Math.round(Number(e.target.value) * 100) / 100)
  }
  ```

Also update `VideoPanel` to drop the `as HTMLVideoElement` cast when constructing `HTML5Player` with an audio ref, now that the constructor accepts `HTMLVideoElement | HTMLAudioElement`.

## Files changed

| File | Change |
|------|--------|
| `frontend/src/player/types.ts` | Add `setVolume` to interface |
| `frontend/src/player/HTML5Player.ts` | Widen constructor type; implement `setVolume` with clamping |
| `frontend/src/player/YouTubePlayer.ts` | Implement `setVolume` with clamping + rounding |
| `frontend/src/contexts/PlayerContext.tsx` | Add `volume` + `setVolume` to state, context value, and `PlayerState` type |
| `frontend/src/components/lesson/VideoPanel.tsx` | Add volume slider UI; import `Volume2`; drop unsafe audio ref cast |

## Out of scope

- Persisting volume preference across sessions
- Mute toggle
- Keyboard shortcut for volume
- Applying current volume to newly registered players
