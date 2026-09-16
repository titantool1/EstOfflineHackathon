import os

from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from sentence_transformers import SentenceTransformer

load_dotenv()


# =====================================
# 1. 기본 설정
# =====================================

INDEX_NAME = "eco-policy"

MODEL_NAME = (
    "sentence-transformers/"
    "paraphrase-multilingual-MiniLM-L12-v2"
)


# =====================================
# 2. Elasticsearch 연결
# =====================================

# 비밀키는 저장소 루트의 .env에서 읽습니다.
es = Elasticsearch(
    os.getenv("ES_LOCAL_URL", "http://localhost:9200"),
    api_key=os.environ["ES_LOCAL_API_KEY"]
)

print(
    "Elasticsearch 버전:",
    es.info()["version"]["number"]
)

# =====================================
# 3. Embedding 모델 로드
# =====================================

print("\nEmbedding 모델 로드 중...")

model = SentenceTransformer(MODEL_NAME)

print("Embedding 모델 준비 완료")


# =====================================
# 4. Elasticsearch 문서 가져오기
# =====================================

response = es.search(
    index=INDEX_NAME,
    size=100,
    query={
        "match_all": {}
    },
    source_excludes=["embedding"]
)

documents = response["hits"]["hits"]

print(
    f"\n찾은 정책 개수: {len(documents)}"
)


# =====================================
# 5. 각 정책을 Vector로 변환
# =====================================

for hit in documents:

    source = hit["_source"]

    # 의미 검색에 사용할 내용들을 하나의 문장으로 합침
    document_text = " ".join([
        source.get("policy_name", ""),
        source.get("category", ""),
        source.get("action", ""),
        source.get("benefit", ""),
        source.get("description", "")
    ])

    # 문장 → 384차원 Vector
    vector = model.encode(
        document_text,
        normalize_embeddings=True
    ).tolist()

    # Elasticsearch 기존 문서에 embedding 추가
    es.update(
        index=INDEX_NAME,
        id=hit["_id"],
        doc={
            "embedding": vector
        }
    )

    print(
        "Embedding 저장:",
        source.get("policy_name")
    )


# 검색 전에 갱신
es.indices.refresh(
    index=INDEX_NAME
)

print("\n모든 Embedding 저장 완료")


# =====================================
# 6. 테스트 질문
# =====================================

query_text = (
    "서울에서 카페에 내 컵을 가져가 쓰면 "
    "보상받을 수 있는 제도가 있을까?"
)

print("\n사용자 질문:")
print(query_text)


# =====================================
# 7. 기존 BM25 검색
# =====================================

bm25_result = es.search(
    index=INDEX_NAME,
    size=3,
    query={
        "multi_match": {
            "query": query_text,
            "fields": [
                "policy_name",
                "action",
                "benefit",
                "description"
            ]
        }
    },
    source_excludes=["embedding"]
)


# =====================================
# 8. Vector 검색
# =====================================

query_vector = model.encode(
    query_text,
    normalize_embeddings=True
).tolist()


vector_result = es.search(
    index=INDEX_NAME,
    knn={
        "field": "embedding",
        "query_vector": query_vector,
        "k": min(2, len(documents)),
        "num_candidates": min(
            10,
            len(documents)
        )
    },
    source_excludes=["embedding"]
)

# =====================================
# 9. Hybrid Search
# BM25 + Vector + 지역 Filter + RRF
# =====================================

USER_REGION = "서울"


hybrid_result = es.search(
    index=INDEX_NAME,
    size=3,

    retriever={
        "rrf": {

            # =================================
            # 지역 Filter
            # 서울 사용자라면
            # "서울" 또는 "전국" 정책만 허용
            # =================================
            "filter": {
                "bool": {
                    "should": [
                        {
                            "term": {
                                "region_scope": USER_REGION
                            }
                        },
                        {
                            "term": {
                                "region_scope": "전국"
                            }
                        }
                    ],
                    "minimum_should_match": 1
                }
            },

            # =================================
            # Hybrid 검색
            # =================================
            "retrievers": [

                # ① BM25
                {
                    "standard": {
                        "query": {
                            "multi_match": {
                                "query": query_text,
                                "fields": [
                                    "policy_name",
                                    "action",
                                    "benefit",
                                    "description"
                                ]
                            }
                        }
                    }
                },

                # ② Vector
                {
                    "knn": {
                        "field": "embedding",
                        "query_vector": query_vector,
                        "k": min(
                            3,
                            len(documents)
                        ),
                        "num_candidates": min(
                            10,
                            len(documents)
                        )
                    }
                }
            ],

            "rank_constant": 60,
            "rank_window_size": 50
        }
    },

    source_excludes=[
        "embedding"
    ]
)



# =====================================
# 9. 결과 비교
# =====================================

print("\n")
print("=" * 50)
print("BM25 검색 결과")
print("=" * 50)

for number, hit in enumerate(
    bm25_result["hits"]["hits"],
    start=1
):
    print(
        number,
        hit["_source"]["policy_name"],
        "score:",
        round(hit["_score"], 4)
    )
print("\n")
print("=" * 50)
print(
    f"HYBRID 검색 결과 "
    f"(지역={USER_REGION} + 전국)"
)
print("=" * 50)

for number, hit in enumerate(
    hybrid_result["hits"]["hits"],
    start=1
):
    source = hit["_source"]

    print(
        number,
        source["policy_name"],
        "| 지역:",
        source["region"],
        "| score:",
        round(hit["_score"], 4)
    )


print("\n")
print("=" * 50)
print("VECTOR 검색 결과")
print("=" * 50)

for number, hit in enumerate(
    vector_result["hits"]["hits"],
    start=1
):
    print(
        number,
        hit["_source"]["policy_name"],
        "score:",
        round(hit["_score"], 4)
    )
