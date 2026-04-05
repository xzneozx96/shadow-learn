import json
from pathlib import Path
import pytest

from app.services.subtitle_segmenter import SubtitleSegmenter

def test_visual_width_calculation():
    segmenter = SubtitleSegmenter(max_visual_width=42.0)
    assert segmenter._calculate_visual_width("Hello world", "en") == 11.0
    assert segmenter._calculate_visual_width("你好世界", "zh-CN") == 4 * 1.75
    # Mixed
    assert segmenter._calculate_visual_width("Hello你好", "zh-CN") == 5.0 + 2 * 1.75
    # Korean (1.5x)
    assert segmenter._calculate_visual_width("안녕", "ko-KR") == 2 * 1.5
    # Full-width symbols (1.75x)
    assert segmenter._calculate_visual_width("！", "zh-CN") == 1.75

def test_split_long_sentence_on_visual_width():
    segmenter = SubtitleSegmenter(max_visual_width=10.0) # Very small width for testing
    words = [
        {"text": "这", "start": 0.0, "end": 0.5},
        {"text": "是", "start": 0.5, "end": 1.0},
        {"text": "一", "start": 1.0, "end": 1.5},
        {"text": "个", "start": 1.5, "end": 2.0},
        {"text": "特", "start": 2.0, "end": 2.5},
        {"text": "别", "start": 2.5, "end": 3.0},
        {"text": "长", "start": 3.0, "end": 3.5},
        {"text": "的", "start": 3.5, "end": 4.0},
        {"text": "句", "start": 4.0, "end": 4.5},
        {"text": "子", "start": 4.5, "end": 5.0},
    ] # Each CJK is 1.75, so width 10 => max 5 chars (5 * 1.75 = 8.75).
    
    chunks = segmenter.segment_words(words, "zh-CN")
    assert len(chunks) >= 2


def test_split_on_punctuation():
    segmenter = SubtitleSegmenter(max_visual_width=42.0)
    words = [
        {"text": "你好！", "start": 0.0, "end": 0.5},
        {"text": "世界", "start": 0.5, "end": 1.0},
    ]
    chunks = segmenter.segment_words(words, "zh-CN")
    assert len(chunks) == 2
    assert [w["text"] for w in chunks[0]] == ["你好！"]
    assert [w["text"] for w in chunks[1]] == ["世界"]

def test_split_on_comma_if_long_enough_and_min_context_ok():
    segmenter = SubtitleSegmenter(max_visual_width=10.0)
    words = [
        {"text": "一", "start": 0.0, "end": 0.5},
        {"text": "二", "start": 0.5, "end": 1.0},
        {"text": "三，", "start": 1.0, "end": 1.5},  # Clause break at index 2 (3rd word), satisfies min_left=3
        {"text": "四", "start": 1.5, "end": 2.0},
        {"text": "五", "start": 2.0, "end": 2.5},
        {"text": "六", "start": 2.5, "end": 3.0},   # Remaining words: index 3, 4, 5 (3 words), satisfies min_right=3
    ]
    # width at comma: 3 * 1.75 = 5.25. max_visual_width=10.0, 5.25 >= 5.0 (50%). OK.
    chunks = segmenter.segment_words(words, "zh-CN")
    assert len(chunks) == 2
    assert [w["text"] for w in chunks[0]] == ["一", "二", "三，"]

def test_min_context_no_split():
    segmenter = SubtitleSegmenter(max_visual_width=10.0)
    words = [
        {"text": "一", "start": 0.0, "end": 0.5},
        {"text": "二，", "start": 0.5, "end": 1.0}, # Only 2 words on left, should NOT split on comma
        {"text": "三", "start": 1.0, "end": 1.5},
        {"text": "四", "start": 1.5, "end": 2.0},
    ]
    chunks = segmenter.segment_words(words, "zh-CN")
    # Should only split on hard limit if reached, not on comma because of min_left constraint
    # Total width: 4 * 1.75 = 7.0. < 10.0. No split expected.
    assert len(chunks) == 1

def test_en_connector_split():
    segmenter = SubtitleSegmenter(max_visual_width=20.0)
    words = [
        {"text": "i", "start": 0.0, "end": 0.5},
        {"text": "like", "start": 0.5, "end": 1.0},
        {"text": "it", "start": 1.0, "end": 1.5},
        {"text": "because", "start": 1.5, "end": 2.0}, # word[3] is a connector
        {"text": "it", "start": 2.0, "end": 2.5},
        {"text": "is", "start": 2.5, "end": 3.0},
        {"text": "good", "start": 3.0, "end": 3.5},
    ]
    # width at "because": 1+1+4+2+7=15. max_visual=20, 15 >= 14 (70%). OK.
    # min_left=3 (i, like, it), min_right=3 (it, is, good). OK.
    chunks = segmenter.segment_words(words, "en")
    assert len(chunks) == 2
    assert [w["text"] for w in chunks[0]] == ["i", "like", "it"]
    assert [w["text"] for w in chunks[1]] == ["because", "it", "is", "good"]

def test_zh_connector_split():
    segmenter = SubtitleSegmenter(max_visual_width=20.0)
    words = [
        {"text": "我", "start": 0.0, "end": 0.5},
        {"text": "喜", "start": 0.5, "end": 1.0},
        {"text": "欢", "start": 1.0, "end": 1.5},
        {"text": "因为", "start": 1.5, "end": 2.0},
        {"text": "它", "start": 2.0, "end": 2.5},
        {"text": "很", "start": 2.5, "end": 3.0},
        {"text": "好", "start": 3.0, "end": 3.5},
    ]
    # width at "因为": 3*1.75 + 2*1.75 = 8.75. max_visual=20, 8.75 < 14 (70%).
    # Should NOT split yet.
    chunks = segmenter.segment_words(words, "zh-CN")
    assert len(chunks) == 1
    
    # Increase current width to trigger
    words_long = [
        {"text": "这", "start": 0.0, "end": 0.5},
        {"text": "是", "start": 0.5, "end": 1.0},
        {"text": "一", "start": 1.0, "end": 1.5},
        {"text": "个", "start": 1.5, "end": 2.0},
        {"text": "句", "start": 2.0, "end": 2.5},
        {"text": "子", "start": 2.5, "end": 3.0},
        {"text": "但是", "start": 3.0, "end": 3.5},
        {"text": "它", "start": 3.5, "end": 4.0},
        {"text": "很", "start": 4.0, "end": 4.5},
        {"text": "短", "start": 4.5, "end": 5.0},
    ]
    # width before "但是": 6 * 1.75 = 10.5. 
    # width at "但是": 10.5 + 2 * 1.75 = 14.0. max_visual=20, 14.0 >= 14 (70%). OK.
    chunks = segmenter.segment_words(words_long, "zh-CN")
    assert len(chunks) == 2
    assert [w["text"] for w in chunks[0]] == ["这", "是", "一", "个", "句", "子"]
    assert [w["text"] for w in chunks[1]] == ["但是", "它", "很", "短"]

def test_with_real_json_fixture():
    fixture_path = Path(__file__).parent.parent / "app" / "deep_gram_transcription.json"
    if not fixture_path.exists():
        pytest.skip(f"Fixture {fixture_path} not found")
        
    with open(fixture_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    utterances = data.get("results", {}).get("utterances", [])
    assert len(utterances) > 0
    
    segmenter = SubtitleSegmenter()
    segmented_utterance_count = 0
    total_segments = 0
    
    for utt in utterances:
        words = []
        for w in utt.get("words", []):
            words.append({
                "text": w.get("punctuated_word") or w["word"],
                "start": w["start"],
                "end": w["end"]
            })
        if not words:
            continue
            
        chunks = segmenter.segment_words(words, language="zh")
        if len(chunks) > 1:
            segmented_utterance_count += 1
        total_segments += len(chunks)
        
        # Verify all words are accounted for 
        flatten_chunks = [word for chunk in chunks for word in chunk]
        assert len(flatten_chunks) == len(words), "All words must be preserved"
        
        # Verify width constraint (approximate, since we force break at max_width)
        for chunk in chunks:
            text = "".join(w["text"] for w in chunk)
            # visual width of chunk text
            width = segmenter._calculate_visual_width(text, "zh")
            # It can slightly exceed max_visual_width if a single word is long, 
            # but usually it should be close to or under 42.0
            assert width <= 50.0, f"Segment width {width} is suspiciously large: '{text}'"
            
    assert segmented_utterance_count > 0, "At least one long utterance should be segmented"
