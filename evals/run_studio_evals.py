"""Studio prompt eval harness.

Exercises generate_studio_artifact for every (kind, locale) pair against
fixture transcripts. Validates:
  - 200 / no exception
  - Pydantic schema (already enforced inside _call_openrouter)
  - Per-kind structural heuristics (counts, depth, locale fidelity)

Run from repo root:
  cd backend && uv run python ../evals/run_studio_evals.py
or with whatever python env has the backend deps:
  PYTHONPATH=backend python evals/run_studio_evals.py
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.tips.services.studio import generate_studio_artifact  # noqa: E402

# Vietnamese diacritic detector (any of the precomposed marks).
_VI_DIACRITIC = re.compile(
    r"[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]",
)


TRANSCRIPT_3MIN_EN = """\
[00:00] Welcome. Today we look at 了 versus 过 in Mandarin.
[00:18] 了 marks a completed action. "我吃了饭" means "I ate the meal", focusing on completion right now.
[00:45] 过 marks past experience at some point in life. "我吃过北京烤鸭" means "I have tried Peking duck before".
[01:10] A common trap: using 了 when you mean lifetime experience. "我去了北京" sounds like recently. "我去过北京" sounds like at some point.
[01:38] 过 cannot be used with current results. Don't say "我感冒过了" if you still have the cold.
[02:00] Quick test. To say "I have eaten dumplings before", which marker? 过. Because we want lifetime experience.
[02:24] Tone tip: 了 is neutral tone le, 过 is fourth tone guò.
[02:48] Recap: 了 = just-now completion, 过 = ever-in-life experience.
"""

TRANSCRIPT_12MIN_EN = """\
[00:00] Welcome to a deep dive on the four tones of Mandarin Chinese.
[00:20] Mandarin has four lexical tones plus a neutral tone. Tone changes meaning.
[00:45] Tone 1 is high and flat. Example: 妈 mā, mother.
[01:15] Tone 2 rises from mid to high. Example: 麻 má, hemp.
[01:50] Tone 3 dips low then rises. Example: 马 mǎ, horse.
[02:20] Tone 4 falls sharply from high to low. Example: 骂 mà, to scold.
[02:55] Neutral tone is short and light. Example: 吗 ma, the question particle.
[03:30] Common trap: half-third tone. In speech, tone 3 before another tone 3 becomes tone 2.
[04:05] Example: 你好 is written nǐ hǎo, but pronounced ní hǎo.
[04:40] Another trap: tone 3 in connected speech often only does the low dip, not the rise.
[05:15] Tone sandhi for 一 yī. It is yī alone, yí before a fourth tone, yì before tones 1/2/3.
[06:00] Tone sandhi for 不 bù. It is bù normally, bú before a fourth tone.
[06:40] Practice: 不是 búshì, 不去 búqù, but 不来 bùlái.
[07:20] Pinyin marks: the diacritic always goes on the main vowel.
[08:00] Vowel priority order: a, o, e, i, u, ü.
[08:40] In iu and ui, the mark goes on the second letter: liù, guǐ.
[09:20] Common mistake for English speakers: stressing tone 2 like a yes/no question.
[10:00] Tone 2 is a steady rise, not a question intonation.
[10:40] Tone 4 sounds angry to English ears, but it is just a sharp fall.
[11:20] Recap: four tones plus neutral. Tone 3 sandhi, 一 sandhi, 不 sandhi.
[11:55] Practice every day with minimal pairs like mā má mǎ mà.
"""

TRANSCRIPT_5MIN_VI = """\
[00:00] Xin chào, hôm nay chúng ta học cách dùng 的, 地, 得 trong tiếng Trung.
[00:25] 的 dùng làm trợ từ định ngữ, đứng giữa tính từ và danh từ. Ví dụ: 漂亮的女孩 — cô gái xinh đẹp.
[01:00] 地 dùng làm trợ từ trạng ngữ, đứng giữa tính từ và động từ. Ví dụ: 慢慢地走 — đi chầm chậm.
[01:40] 得 dùng làm trợ từ bổ ngữ, đứng giữa động từ và bổ ngữ chỉ mức độ. Ví dụ: 跑得很快 — chạy rất nhanh.
[02:15] Bẫy thường gặp: nhiều người viết "他高兴的笑了". Câu này sai. Phải là "他高兴地笑了" — anh ấy cười vui vẻ.
[02:50] Một mẹo: nhìn vào từ đứng sau. Nếu là danh từ thì dùng 的, nếu là động từ thì dùng 地, nếu là bổ ngữ chỉ mức độ thì dùng 得.
[03:25] Phát âm: cả ba từ này đều đọc là "de" nhẹ, nhưng chữ viết khác nhau.
[04:00] Ôn tập nhanh: 漂亮的衣服, 高兴地跳, 写得很好.
[04:35] Hẹn gặp lại các bạn ở bài tiếp theo.
"""


CASES = [
    {"name": "3min-EN", "transcript": TRANSCRIPT_3MIN_EN, "locale": "en"},
    {"name": "12min-EN", "transcript": TRANSCRIPT_12MIN_EN, "locale": "en"},
    {"name": "5min-VI", "transcript": TRANSCRIPT_5MIN_VI, "locale": "vi"},
]

KINDS = ["summary", "study_guide", "cards", "mind_map"]


def _tree_stats(root: dict[str, Any]) -> tuple[int, int]:
    """Return (depth, node_count) for a mind-map root."""
    def walk(node: dict[str, Any], depth: int) -> tuple[int, int]:
        deepest = depth
        count = 1
        for child in node.get("children", []) or []:
            d, c = walk(child, depth + 1)
            deepest = max(deepest, d)
            count += c
        return deepest, count

    return walk(root, 1)


def _collect_labels(root: dict[str, Any]) -> list[str]:
    out: list[str] = []

    def walk(node: dict[str, Any]) -> None:
        out.append(node.get("label", ""))
        for c in node.get("children", []) or []:
            walk(c)

    walk(root)
    return out


def _has_vi(text: str) -> bool:
    return bool(_VI_DIACRITIC.search(text))


def _evaluate(kind: str, locale: str, data: dict[str, Any]) -> list[str]:
    """Return list of '✅ check' / '❌ check' lines."""
    out: list[str] = []
    if kind == "summary":
        t = data.get("takeaways") or []
        out.append(f"{'✅' if 3 <= len(t) <= 6 else '❌'} takeaways count {len(t)} in [3..6]")
        if locale == "vi":
            text = (data.get("abstract") or "") + " ".join(t)
            out.append(f"{'✅' if _has_vi(text) else '❌'} locale: VI diacritics present")
    elif kind == "study_guide":
        items = data.get("items") or []
        out.append(f"{'✅' if 3 <= len(items) <= 10 else '❌'} items count {len(items)} in [3..10]")
        if locale == "vi":
            text = " ".join((i.get("question", "") + i.get("answer", "")) for i in items)
            out.append(f"{'✅' if _has_vi(text) else '❌'} locale: VI diacritics present")
    elif kind == "cards":
        cards = data.get("cards") or []
        out.append(f"{'✅' if 1 <= len(cards) <= 8 else '❌'} cards count {len(cards)} in [1..8]")
        ids = [c.get("id", "") for c in cards]
        out.append(f"{'✅' if len(set(ids)) == len(ids) else '❌'} card ids unique")
        if locale == "vi":
            text = " ".join((c.get("rule", "") + c.get("front", "")) for c in cards)
            out.append(f"{'✅' if _has_vi(text) else '❌'} locale: VI diacritics present")
    elif kind == "mind_map":
        root = data.get("root") or {}
        depth, count = _tree_stats(root)
        out.append(f"{'✅' if depth <= 4 else '❌'} depth {depth} <= 4")
        out.append(f"{'✅' if count <= 60 else '❌'} nodes {count} <= 60")
        out.append(f"{'✅' if count >= 5 else '❌'} nodes {count} >= 5")
        labels = _collect_labels(root)
        # Sibling-duplicate scan.
        def sib_dups(node: dict[str, Any]) -> int:
            kids = [c.get("label", "") for c in node.get("children", []) or []]
            d = len(kids) - len(set(kids))
            for c in node.get("children", []) or []:
                d += sib_dups(c)
            return d
        dups = sib_dups(root)
        out.append(f"{'✅' if dups == 0 else '❌'} sibling-duplicate labels: {dups}")
        if locale == "vi":
            text = " ".join(labels)
            out.append(f"{'✅' if _has_vi(text) else '❌'} locale: VI diacritics in labels")
    return out


async def _run_one(kind: str, locale: str, transcript: str) -> dict[str, Any]:
    t0 = time.monotonic()
    try:
        data = await generate_studio_artifact(
            kind=kind, transcript=transcript, locale=locale,  # type: ignore[arg-type]
        )
        elapsed = time.monotonic() - t0
        checks = _evaluate(kind, locale, data)
        return {"ok": True, "elapsed": elapsed, "checks": checks, "data": data}
    except Exception as exc:  # noqa: BLE001
        elapsed = time.monotonic() - t0
        return {"ok": False, "elapsed": elapsed, "error": f"{type(exc).__name__}: {exc}"}


async def main() -> int:
    results_dir = REPO_ROOT / "evals" / "results"
    results_dir.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    out_md = results_dir / f"studio-prompts-{ts}.md"
    out_json = results_dir / f"studio-prompts-{ts}.json"

    md = ["# Studio prompt eval run", "", f"Timestamp: {ts}", ""]
    raw: dict[str, Any] = {"timestamp": ts, "cases": []}

    overall_pass = 0
    overall_fail = 0

    for case in CASES:
        md.append(f"## Case: {case['name']} (locale={case['locale']})")
        md.append("")
        case_record: dict[str, Any] = {"name": case["name"], "locale": case["locale"], "kinds": {}}

        for kind in KINDS:
            print(f"[{case['name']}] {kind} …", flush=True)
            result = await _run_one(kind, case["locale"], case["transcript"])
            case_record["kinds"][kind] = {
                "ok": result["ok"],
                "elapsed_s": round(result["elapsed"], 2),
                "checks": result.get("checks", []),
                "error": result.get("error"),
            }
            md.append(f"### {kind} — {result['elapsed']:.1f}s")
            if not result["ok"]:
                md.append(f"❌ EXCEPTION: `{result['error']}`")
                overall_fail += 1
            else:
                for line in result["checks"]:
                    md.append(f"- {line}")
                    if line.startswith("✅"):
                        overall_pass += 1
                    else:
                        overall_fail += 1
            md.append("")

        raw["cases"].append(case_record)

    md.insert(3, f"Overall: ✅ {overall_pass}  ❌ {overall_fail}")
    md.insert(4, "")

    out_md.write_text("\n".join(md), encoding="utf-8")
    out_json.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 60)
    print(f"Wrote {out_md}")
    print(f"Wrote {out_json}")
    print(f"Overall: ✅ {overall_pass}  ❌ {overall_fail}")
    return 0 if overall_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
