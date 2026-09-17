from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from search import healthcheck, hybrid_search, recommend_by_interests, search_places

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    region: str | None = Field(default="서울특별시", max_length=50)
    size: int = Field(default=5, ge=1, le=10)
    doc_types: list[str] | None = None


class PlacesRequest(BaseModel):
    query: str = Field(default="", max_length=200)
    region: str | None = Field(default="서울특별시", max_length=50)
    latitude: float = Field(default=37.5665, ge=-90, le=90)
    longitude: float = Field(default=126.9780, ge=-180, le=180)
    distance_km: float = Field(default=30, gt=0, le=100)
    size: int = Field(default=40, ge=1, le=50)


class InterestRecommendationRequest(BaseModel):
    interest_ids: list[str] = Field(default_factory=list, max_length=7)
    region: str | None = Field(default="서울특별시", max_length=50)
    size: int = Field(default=40, ge=1, le=60)
    exclude_doc_ids: list[str] = Field(default_factory=list, max_length=100)
    seed: str = Field(default="eco-jupjup", max_length=160)


@app.get("/health")
def health():
    try:
        return healthcheck()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="검색 서비스를 확인할 수 없습니다.") from exc


@app.post("/api/search")
def search(request: SearchRequest):
    allowed_types = {"policy", "action", "place"}
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="질문을 입력해 주세요.")
    if request.doc_types and not set(request.doc_types) <= allowed_types:
        raise HTTPException(status_code=400, detail="지원하지 않는 문서 유형입니다.")
    try:
        return hybrid_search(
            query,
            region=request.region,
            size=request.size,
            doc_types=request.doc_types,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="검색 중 문제가 발생했습니다.") from exc


@app.post("/api/places")
def places(request: PlacesRequest):
    try:
        return search_places(
            request.query,
            region=request.region,
            latitude=request.latitude,
            longitude=request.longitude,
            distance_km=request.distance_km,
            size=request.size,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="장소를 불러오는 중 문제가 발생했습니다.") from exc


@app.post("/api/interest-recommendations")
def interest_recommendations(request: InterestRecommendationRequest):
    try:
        return recommend_by_interests(
            request.interest_ids,
            region=request.region,
            size=request.size,
            excluded_doc_ids=request.exclude_doc_ids,
            seed=request.seed,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="관심사 추천을 불러오는 중 문제가 발생했습니다.") from exc
