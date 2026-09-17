# Elasticsearch 검색 인덱스 데이터

`eco-jupjup-vector-v2.full.jsonl.gz`는 챗봇에서 사용하는 `eco-jupjup-vector-v2` 인덱스의 휴대용 백업이다.

- 문서: 17,850건
- 구성: 정책 61건, 행동·혜택 188건, 장소 17,601건
- 임베딩: 모든 문서에 `intfloat/multilingual-e5-small` 384차원 벡터 포함
- 관심사: 모든 문서에 `interest_ids`가 1개 이상 매핑됨(중복 관심사 허용)
- 압축 파일 SHA-256: `973e4c7db2cf1dad7e54178c38a9467f7d8ae23bdeb153e4f3249a04a79f21ea`
- 사용자 계정·대화·미션 이벤트·API 키는 포함하지 않음

## 새 환경에 복원

저장소 루트에서 Elasticsearch와 Python 환경을 준비한다.

```bash
python3 scripts/setup-local.py
docker compose up -d --wait elasticsearch
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

먼저 압축 파일 구조와 문서 수를 확인한다.

```bash
.venv/bin/python scripts/restore-search-index.py \
  --input search-data/eco-jupjup-vector-v2.full.jsonl.gz \
  --verify-only
```

대상 인덱스가 없는 새 환경에 복원한다.

```bash
.venv/bin/python scripts/restore-search-index.py \
  --input search-data/eco-jupjup-vector-v2.full.jsonl.gz
```

이미 같은 이름의 인덱스가 있으면 기본 명령은 안전하게 중단한다. 기존 인덱스를 이 백업으로 교체하려는 의도가 확실할 때만 `--replace`를 추가한다.

```bash
.venv/bin/python scripts/restore-search-index.py \
  --input search-data/eco-jupjup-vector-v2.full.jsonl.gz \
  --replace
```

복원 후 챗봇 검색 서버를 실행한다.

```bash
AI_SERVER_PORT=18000 ./run-ai.sh
```

## 백업 재생성

혜택 원본과 관심사 규칙을 동기화한 뒤 현재 `.env`가 가리키는 Elasticsearch의 인덱스에서 매핑, 문서와 임베딩을 다시 추출한다.

```bash
.venv/bin/python scripts/sync-interest-mapping.py
.venv/bin/python scripts/export-search-index.py \
  --index eco-jupjup-vector-v2 \
  --output search-data/eco-jupjup-vector-v2.full.jsonl.gz
```

재생성하면 문서 수, 검색 결과와 SHA-256을 다시 검증한 뒤 변경을 커밋한다.
