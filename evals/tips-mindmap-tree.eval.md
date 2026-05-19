# Eval: Tips Mind Map — Tree Quality

Run manually before claiming B3 Mind Map ships. Pick three Tip videos covering the matrix.

## Test matrix

| Case | Video length | Language | Expected outcome |
|------|--------------|----------|------------------|
| 1 | 3 min | English | Tree with 10-20 nodes, depth 2-3. Concepts grounded in transcript. |
| 2 | 12-15 min | English | Tree with 25-50 nodes, depth 3-4. Distinct subtopics per branch. |
| 3 | 5 min | Vietnamese | Labels in Vietnamese. Tree shape similar to case 1. |

## Per-case checks

For each case, click Generate on the Mind Map tile and verify:

1. **Validation pass:** Response 200, no 502. Tree depth <= 4, total nodes <= 60.
2. **Grounded labels:** Every node label maps to a concept actually present in the transcript. Skim 5 random nodes; if any feels hallucinated, fail the case.
3. **No duplicates:** No two sibling nodes have the same label.
4. **Locale fidelity:** Case 3 — every label is in Vietnamese, no English bleed.
5. **Click behavior:** Click 3 random nodes. Each switches the Studio drill-down to the tutor ChatTab with the prefilled prompt; streaming response stays on topic for the clicked branch.
6. **Cache:** Open MM, leave the Tip, return. Tree appears instantly with no network call (check DevTools Network tab).
7. **Regenerate:** Click regenerate. New tree replaces old. Old IDB row is overwritten.
8. **Shared tutor thread:** After clicking a MM node and getting an answer, switch to the main Chat tab in UtilityPane — the MM question + its answer appear in the shared thread (proves no new chat scope was introduced).

## Failing the eval

If any case fails check 1, 2, or 4 → ship blocker. Iterate prompt.
If a case fails check 3, 5, 6, 7, or 8 → file a B3.1 polish ticket; not a blocker.

## Run results

(Fill in after running locally.)

Run via `evals/run_studio_evals.py`. Latest: `evals/results/studio-prompts-20260519-105505.md`.

- Case 1 (3-min EN): ✅ depth 4, 16 nodes, no sibling dupes
- Case 2 (12-min EN): ✅ depth 4, 24 nodes, no sibling dupes
- Case 3 (5-min VI): ✅ depth 3, 15 nodes, no sibling dupes, VI diacritics in labels

Initial run hit a recurring ship-blocker: LLM emitted the root tree node at top level instead of `{"root": {...}}`. Fixed in `build_prompt` (`backend/app/tips/services/studio.py`) — prompt now states wrapper explicitly with literal JSON shape. Re-run: 28/28 checks pass across all kinds × locales.

Manual checks (2, 5, 6, 7, 8) still require human dogfood per matrix above.
