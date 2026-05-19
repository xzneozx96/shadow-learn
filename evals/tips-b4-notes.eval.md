# Eval: Tips B4 — Notes Tab Manual Dogfood

Run before claiming B4 ships. Open a real Tip lesson with a transcript.

## Capture sources

- [ ] **Freeform:** Notes tab → New note → title → type body → reload → persists
- [ ] **Chat save:** Chat → ask question → Save-to-Note icon appears on assistant message hover (desktop) or always-visible (mobile) → click → toast → Notes tab shows the message
- [ ] **Save-from-Chat works on FRESH lesson (Notes tab never visited yet):** new lesson → directly Chat → save assistant message → toast → Notes shows it (verifies hook hoisted to UtilityPane works)
- [ ] **Summary save:** Open Summary in UtilityPane → hover takeaway → Save icon → click → Notes shows item
- [ ] **Study Guide save:** Studio → Study Guide → hover Q+A row → Save → Notes shows item
- [ ] **MindMap save:** Studio → Mind Map → Save icon on node → Notes shows label + summary
- [ ] **Card save:** Studio → Cards → Save icon on FlipCard → Notes shows front + rule + example + trap

## Discuss-this-note loop

- [ ] Open saved note → Discuss button → Chat tab opens → chip visible above input
- [ ] Type follow-up → send → chip text prepended as `> quoted` block → chip clears → assistant replies in context
- [ ] Re-discuss same note (no edits) → fresh chip appears (no dedupe)
- [ ] Two notes Discuss'd → 2 chips stack
- [ ] Remove chip via X → next send has no quoted prefix

## Editor behavior

- [ ] TipTap loads on first New note click; chunk visible in DevTools → Network
- [ ] B/I/Strike/Code/H1-H3/BulletList/OrderedList all toggle
- [ ] Body typing is debounced (no IDB write per keystroke; check DevTools → Application)
- [ ] Title typing is also debounced (400ms) + commits on blur + commits on back chevron
- [ ] Back chevron returns to list; list shows latest note at top
- [ ] Delete from action menu shows confirm dialog; confirm removes row
- [ ] **Delete while editing:** open a note → delete from menu → confirm → surface returns to list (no blank screen)
- [ ] Rename prompts for new title; updates list

## State + reload

- [ ] Reload mid-edit — pending debounce flushes on unmount; no data loss
- [ ] Switch tabs and back — note list state survives; chip state survives
- [ ] Open a different Tip video — Notes tab shows that video's notes only

## Performance + bundle

- [ ] `pnpm build` emits a tiptap chunk separately
- [ ] First-paint of a Tip page (no Notes click) does NOT load tiptap chunk
- [ ] Editor chunk loads in <500ms on first New note click

## Error paths

- [ ] DevTools → Network → block `*tiptap*` → click New note → ErrorBoundary shows Retry button
- [ ] Throttle to offline → Save-to-Note from Chat → toast.success still appears (IDB local write)

## Migration

- [ ] In a fresh Chromium profile with v16 IDB (last shipped B3 build), upgrade to this build → B3 stores intact → Notes empty state shows → New note works
