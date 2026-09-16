const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://127.0.0.1:8000";

type PlacesRequest = {
  query?: unknown;
  region?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  distanceKm?: unknown;
};

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "JSON 요청만 지원합니다." }, { status: 415 });
  }

  let body: PlacesRequest;
  try {
    body = (await request.json()) as PlacesRequest;
  } catch {
    return Response.json({ error: "요청 형식을 확인해 주세요." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const region = typeof body.region === "string" ? body.region.trim() : "서울특별시";
  if (query.length > 200) {
    return Response.json({ error: "검색어는 200자 이하로 입력해 주세요." }, { status: 400 });
  }

  try {
    const response = await fetch(`${AI_SERVER_URL}/api/places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        region,
        latitude: finiteNumber(body.latitude, 37.5665),
        longitude: finiteNumber(body.longitude, 126.978),
        distance_km: finiteNumber(body.distanceKm, 30),
        size: 40,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      return Response.json(
        { error: "장소 검색 서버가 응답하지 않았어요. 잠시 후 다시 시도해 주세요." },
        { status: response.status >= 500 ? 503 : 400 },
      );
    }
    return Response.json(await response.json());
  } catch {
    return Response.json(
      { error: "장소 검색 서버에 연결할 수 없어요." },
      { status: 503 },
    );
  }
}
