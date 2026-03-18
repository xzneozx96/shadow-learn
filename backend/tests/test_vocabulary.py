import pytest
from app.services.vocabulary import VocabularyExtractionError, _VOCAB_BATCH_SIZE


def test_vocabulary_extraction_error_is_exception():
    err = VocabularyExtractionError("segments [1, 2] failed")
    assert isinstance(err, Exception)
    assert "segments [1, 2] failed" in str(err)


def test_vocab_batch_size_is_five():
    assert _VOCAB_BATCH_SIZE == 5
