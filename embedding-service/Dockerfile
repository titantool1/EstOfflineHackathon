FROM python:3.12.3-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app
COPY requirements.lock.txt ./
RUN python -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.lock.txt
COPY contract.py encoder.py server.py healthcheck.py download.py ./

EXPOSE 8090
CMD ["python", "/app/server.py"]
