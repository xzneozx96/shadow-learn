# Download Media Feature — Design Spec

**Date:** 2026-03-15
**Status:** Approved

## Overview

Add a download button to the lesson view so users can save the lesson's audio (YouTube lessons) or video (uploaded lessons) to their local filesystem. The media blob is already stored in IndexedDB, so no new network requests or DB schema changes are needed.

## Scope

- Works for both lesson sources: `youtube` (MP3 audio) and `upload` (video file)
- Placement: VideoPanel header, alongside the existing home button
- No backend changes required

## UI

A ghost icon button (`Download` icon from `lucide-react`) in the VideoPanel header, to the right of the home/back button. Wrapped in a `Tooltip` with the label "Download audio" (YouTube) or "Download video" (upload). Uses `variant="ghost" size="icon-sm"` — this size variant exists in the local `button.tsx`. Hidden (not rendered) when `videoBlob` is `undefined`.

`videoBlob` is already passed as a prop to `VideoPanel` from `LessonView`, so no additional fetching is needed.

## Download Logic

Entirely self-contained in `VideoPanel.tsx`, implemented as a `useCallback`:

```
1. Compute filename: sanitize(lesson.title) + ext  (see Filename Convention)
2. objectUrl = URL.createObjectURL(videoBlob)
3. Create a hidden <a> with href=objectUrl and download=filename
4. document.body.appendChild(a) → a.click() → document.body.removeChild(a)
5. setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
   — deferred to avoid revoking before the browser initiates the download
```

Blob URLs are same-origin so the `download` attribute works without restriction.
No state changes needed — this is a one-shot imperative action.

## Filename Convention

The filename is `{sanitizedBase}{ext}`. Sanitization is applied to the **base name only**; the extension is appended afterward.

### Base name sanitization

1. Replace spaces with hyphens
2. Strip characters outside `[a-zA-Z0-9._-]`
3. Trim leading/trailing hyphens
4. Truncate to 100 chars
5. If result is empty, use `"lesson"`

### Extension

**YouTube lessons:** The backend extracts audio as MP3 via yt-dlp's `FFmpegExtractAudio` postprocessor with `preferredcodec: "mp3"` — the output is always an MP3 file. The stored blob is trusted to be MP3; no fallback is needed. Extension: `.mp3`.

**Uploaded lessons:** Derived from `videoBlob.type`. Split on `;` and take the first segment, then trim whitespace — e.g. `"video/mp4; codecs=avc1"` → `"video/mp4"`.

MIME → extension mapping:
- `video/mp4` → `.mp4`
- `video/webm` → `.webm`
- `video/quicktime` → `.mov`
- `video/x-msvideo` → `.avi`
- anything else → `.mp4` (fallback)

## Implementation

Single file change: `frontend/src/components/lesson/VideoPanel.tsx`

- Add `Download` to lucide-react imports
- Add `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent` imports from `@/components/ui/tooltip`. Wrap the download button's `<Tooltip>` in its own `<TooltipProvider>` — this is the established pattern in the codebase (see `WordTooltip.tsx`); there is no app-level provider in VideoPanel's ancestor tree
- Add `handleDownload` as a `useCallback`. `lesson` is passed as a whole object prop; access `lesson.title` and `lesson.source` inside the callback. Deps: `[videoBlob, lesson.title, lesson.source]`
- Render the button in the header after the home button, conditionally when `videoBlob` is defined

## Edge Cases

- Button not rendered if `videoBlob` is `undefined`
- Sanitized base name falls back to `"lesson"` if empty after sanitization
- Leading/trailing hyphens trimmed after sanitization
- Truncation applied to base name only, before extension is appended
- URL revocation deferred 100ms to avoid download race condition
- `<a>` appended to and removed from `document.body`
