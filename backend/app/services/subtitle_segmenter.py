from typing import Sequence

from app.services.transcription_provider import _WordTiming

class SubtitleSegmenter:
    """
    Splits long streams of words into well-sized segments for subtitles,
    mimicking Netflix's subtitle segmentation guidelines and VideoLingo heuristics.
    """
    
    _CONNECTORS = {
        "en": ["that", "which", "where", "when", "because", "but", "and", "or"],
        "zh": ["因为", "所以", "但是", "而且", "虽然", "如果", "即使", "尽管", "那么"],
        "ja": ["けれども", "しかし", "だから", "それで", "ので", "のに", "ため"],
    }
    
    def __init__(self, max_visual_width: float = 42.0, gap_threshold_seconds: float = 1.0):
        self.max_visual_width = max_visual_width
        self.gap_threshold_seconds = gap_threshold_seconds
        
        self.sentence_endings = set("。！？.!?")
        self.clause_breaks = set("，,、；;：:")

    def _calculate_visual_width(self, text: str, language: str) -> float:
        """
        Calculates the visual width of a string.
        Based on VideoLingo's calc_len logic using explicit Unicode ranges.
        """
        width = 0.0
        for char in text:
            code = ord(char)
            if 0x4E00 <= code <= 0x9FFF or 0x3040 <= code <= 0x30FF:  # Chinese and Japanese
                width += 1.75
            elif 0xAC00 <= code <= 0xD7A3 or 0x1100 <= code <= 0x11FF:  # Korean
                width += 1.5
            elif 0xFF01 <= code <= 0xFF5E:  # Full-width symbols
                width += 1.75
            else:  # Other characters (English, spaces, half-width symbols)
                width += 1.0
        return width

    def segment_words(self, words: Sequence[_WordTiming], language: str) -> list[list[_WordTiming]]:
        """
        Segments a list of word timings into smaller chunks based on priority:
        1. Time gaps > gap_threshold_seconds (HIGH)
        2. Sentence-ending punctuation (HIGH)
        3. Connector words lookahead (MEDIUM-HIGH)
        4. Clause breaks (MEDIUM)
        5. Visual width hard limit (HARD)
        """
        if not words:
            return []

        chunks: list[list[_WordTiming]] = []
        current_chunk: list[_WordTiming] = []
        current_width = 0.0
        
        lang_prefix = language.split("-")[0].lower()
        connectors = self._CONNECTORS.get(lang_prefix, [])

        for i, word in enumerate(words):
            text = word["text"]
            word_width = self._calculate_visual_width(text, language)

            # 1. [BEFORE appending] Check time gap with previous word
            if current_chunk:
                prev_end = current_chunk[-1]["end"]
                gap = word["start"] - prev_end
                if gap > self.gap_threshold_seconds:
                    chunks.append(current_chunk)
                    current_chunk = []
                    current_width = 0.0

            # 2. [BEFORE appending] Check if next word is a connector
            if i > 0 and current_chunk:
                clean_word = text.strip().lower()
                # If word[i] is a connector, and we have enough context
                if clean_word in connectors:
                    # Minimum Context: 3 words left, 3 words right
                    min_left_ok = len(current_chunk) >= 3
                    min_right_ok = (len(words) - i) >= 3
                    
                    # Threshold: split if current width + this word exceeds 70%
                    if min_left_ok and min_right_ok and (current_width + word_width) >= (self.max_visual_width * 0.7):
                        chunks.append(current_chunk)
                        current_chunk = []
                        current_width = 0.0

            current_chunk.append(word)
            current_width += word_width

            # Get clean text to check endings
            clean_text = text.rstrip()
            if not clean_text:
                continue

            last_char = clean_text[-1]

            # 3. [AFTER appending] Condition: Sentence ending punctuation (HIGH)
            if last_char in self.sentence_endings:
                chunks.append(current_chunk)
                current_chunk = []
                current_width = 0.0
                continue

            # 4. [AFTER appending] Condition: Clause breaks (MEDIUM)
            if last_char in self.clause_breaks:
                min_left_ok = len(current_chunk) >= 3
                min_right_ok = (len(words) - (i + 1)) >= 3
                if min_left_ok and min_right_ok and current_width >= (self.max_visual_width * 0.5):
                    chunks.append(current_chunk)
                    current_chunk = []
                    current_width = 0.0
                    continue

            # 5. [AFTER appending] Condition: Hard visual width limit
            next_word_width = 0.0
            if i + 1 < len(words):
                next_word_width = self._calculate_visual_width(words[i + 1]["text"], language)

            if current_width >= self.max_visual_width or (current_width + next_word_width > self.max_visual_width):
                chunks.append(current_chunk)
                current_chunk = []
                current_width = 0.0
                continue

        if current_chunk:
            chunks.append(current_chunk)
            
        return chunks
