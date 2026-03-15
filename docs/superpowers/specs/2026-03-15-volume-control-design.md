# Volume Control — Design Spec

**Date:** 2026-03-15

## Summary

Add a volume slider to the video player controls bar so users can boost or lower audio level without leaving the app.

## Scope

- Slider only, no mute toggle
- Affects both player types: HTML5 (uploaded video) and YouTube (audio-only via `<audio>`)
- Volume range: 0–1 (0% to 100%)
- Default: 1 (full volume)

## Player Layer (`types.ts`)

Add one method to the `VideoPlayer` interface:

```ts
setVolume(volume: number): void  // volume in [0, 1]
```

## Implementation per player

**`HTML5Player`**
```ts
setVolume(volume: number): void {
  this.element.volume = volume
}
```
Native HTML media element supports `volume` in [0, 1] directly.

**`YouTubePlayer`**
```ts
setVolume(volume: number): void {
  this.player?.setVolume(volume * 100)
}
```
YouTube IFrame API uses a 0–100 scale, so multiply by 100.

## State (`PlayerContext`)

Add `volume` and `setVolume` to `PlayerState`, parallel to `playbackRate`:

```ts
volume: number           // [0, 1], default 1
setVolume: (v: number) => void
```

`setVolume` calls `player.setVolume(v)` then updates local state.

## UI (`VideoPanel`)

Location: right end of the transport controls row, after the playback rate buttons.

Controls row layout (left → right):
```
[SkipBack][Play][SkipForward]   0:00 / 5:30   [0.5x]…[1.5x]   🔊 ──●──
```

The volume widget:
- `Volume2` icon (Lucide) — visual label only, not a button
- `<input type="range" min={0} max={1} step={0.05}>` — `w-20`, `accent-primary` to match scrubber style
- Reads `volume` from `PlayerContext`, writes via `setVolume`

## Files changed

| File | Change |
|------|--------|
| `frontend/src/player/types.ts` | Add `setVolume` to interface |
| `frontend/src/player/HTML5Player.ts` | Implement `setVolume` |
| `frontend/src/player/YouTubePlayer.ts` | Implement `setVolume` |
| `frontend/src/contexts/PlayerContext.tsx` | Add `volume` state + `setVolume` |
| `frontend/src/components/lesson/VideoPanel.tsx` | Add volume slider UI |

## Out of scope

- Persisting volume preference across sessions
- Mute toggle
- Keyboard shortcut for volume
