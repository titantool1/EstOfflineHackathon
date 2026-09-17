MODEL_ID = "BAAI/bge-m3"
REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
DIMENSION = 1024
METADATA = {"model": MODEL_ID, "revision": REVISION, "dimension": DIMENSION,
            "normalized": True, "max_sequence_length": 512}
MAX_BYTES = 18000


def validate_texts(payload):
    texts = payload.get("texts") if isinstance(payload, dict) else None
    if not isinstance(texts, list) or not 1 <= len(texts) <= 2:
        raise ValueError("invalid_texts")
    if any(not isinstance(text, str) or not text.strip() or len(text) > 2000 for text in texts):
        raise ValueError("invalid_texts")
    return texts
