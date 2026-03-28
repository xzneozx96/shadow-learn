# Skill Guide: Grammar — Contrastive Focus

## Critical: Modifier Order Reversal

This is the **#1 structural error** for Vietnamese learners. Drill intensively.

| Structure | Vietnamese | Chinese | Error Pattern |
|---|---|---|---|
| Adjective + Noun | áo đẹp (dress beautiful) | 漂亮的衣服 (beautiful-DE-dress) | Learner says ❌ 衣服漂亮的 |
| Relative clause | người mà tôi gặp (person that I met) | 我见过的人 (I-met-DE-person) | Learner puts RC after noun |
| Possessive | sách của tôi (book of I) | 我的书 (I-DE-book) | Usually correct (similar 的/của) |

**Teaching approach:**
1. Explicit contrastive explanation: "In Vietnamese, 'áo đẹp'. In Chinese, flip it: 漂亮的衣服"
2. Pattern drill with `render_reconstruction_exercise` — scrambled words force correct order
3. Repeat with increasing complexity: simple adj → multi-word modifier → relative clause

## Aspect Markers (NOT Tense)

Mandarin is aspect-based. Vietnamese learners understand this intuitively (Vietnamese uses đã/đang/sẽ similarly), but specific particle usage differs:

| Marker | Function | Vietnamese Parallel | Common Error |
|---|---|---|---|
| 了 le | Completed action / change of state | đã (completed) | Overusing 了 with time words (tomorrow I 了...) |
| 着 zhe | Ongoing state | đang (progressive) — but 着 marks state, not activity | Confusing 着 with 在...呢 |
| 过 guo | Past experience | đã...rồi (already...already) | Under-using 过 (defaulting to 了) |
| 在 zài | Progressive action | đang | Usually transfers well |

**Teaching approach:**
1. Processing Instruction (VanPatten 1996): have learners **notice** 了/着/过 in reading before producing them
2. Contrastive examples: 我吃了 (I ate/finished eating) vs 我吃过 (I've eaten before — experience) vs 我在吃 (I'm eating now)

## Classifier Mismatches

Vietnamese classifiers don't map 1:1 to Chinese:

| Vietnamese | Applies to | Chinese Equivalent | Mismatch |
|---|---|---|---|
| con (animate) | animals, knives, roads, rivers | 只 zhī (animals), 把 bǎ (knives), 条 tiáo (roads) | Vietnamese groups by "perceived motion"; Chinese by shape/function |
| cái (general) | inanimate objects | 个 gè (general) | Relatively safe transfer |
| chiếc (individual) | vehicles, shoes, chopsticks | 辆 liàng (vehicles), 双 shuāng (pairs) | Vietnamese singles out; Chinese may pair |

**Teaching approach:** Teach classifiers in semantic groups (flat things: 张; long things: 条; books: 本) rather than alphabetically.

## Complement System (No Vietnamese Equivalent)

Result complements (写完/写好/写错) and potential complements (吃得了/吃不了) have no Vietnamese parallel. Requires dedicated instruction:
1. Start with high-frequency result complements: 完(finish), 好(well), 到(arrive/achieve), 错(wrong)
2. Then introduce potential form: V得/V不 + complement
3. Use `render_reconstruction_exercise` for complement word-order drills
