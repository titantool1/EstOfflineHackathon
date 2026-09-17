"""Explicit first-run download; normal inference remains offline."""
from huggingface_hub import snapshot_download
from contract import MODEL_ID, REVISION

snapshot_download(repo_id=MODEL_ID, revision=REVISION, cache_dir="/models",
                  allow_patterns=["*.json", "*.txt", "*.model", "pytorch_model.bin", "1_Pooling/*"])
print("Pinned BGE-M3 snapshot ready")
