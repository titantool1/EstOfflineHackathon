import os
from pathlib import Path
from contract import DIMENSION, REVISION


def load_encoder():
    import torch
    from sentence_transformers import SentenceTransformer
    path = Path(os.environ.get("MODEL_PATH", f"/models/models--BAAI--bge-m3/snapshots/{REVISION}"))
    if path.name != REVISION or not (path / "config.json").is_file():
        raise RuntimeError("Pinned BGE snapshot missing; run the embedding-download service first")
    torch.set_num_threads(4)
    model = SentenceTransformer(str(path), device="cpu", local_files_only=True, trust_remote_code=False)
    model.max_seq_length = 512
    if model.get_sentence_embedding_dimension() != DIMENSION:
        raise RuntimeError("Unexpected embedding dimension")

    def encode(texts):
        vectors = model.encode(texts, batch_size=2, normalize_embeddings=True,
                               show_progress_bar=False, convert_to_numpy=True)
        if vectors.shape != (len(texts), DIMENSION):
            raise RuntimeError("Unexpected embedding shape")
        return vectors.tolist()
    return encode
