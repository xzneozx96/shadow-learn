from opencc import OpenCC

# Initialized once at module load. OpenCC.__init__ calls _init_dict() eagerly,
# so _dict_init_done is True before any call to convert(). After init, convert()
# only reads shared state. Safe for concurrent use from the asyncio event loop
# (single thread). If ever moved to a thread pool, add a threading.Lock.
_converter = OpenCC("t2s")


def normalize_chinese(text: str) -> str:
    """Convert Traditional Chinese characters to Simplified. Already-simplified text passes through unchanged."""
    return _converter.convert(text)
