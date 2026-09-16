const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://127.0.0.1:8000";

type ChatRequest = { query?: unknown; region?: unknown };

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "JSON 요청만 지원합니다." }, { status: 415 });
  }
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "요청 형식을 확인해 주세요." }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const region = typeof body.region === "string" ? body.region.trim() : "서울특별시";
  if (!query || query.length > 500) {
    return Response.json({ error: "질문은 1자 이상 500자 이하로 입력해 주세요." }, { status: 400 });
  }
  try {
    const response = await fetch(`${AI_SERVER_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, region, size: 5 }),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      return Response.json(
        { error: "검색 서버가 응답하지 않았어요. 잠시 후 다시 시도해 주세요." },
        { status: response.status >= 500 ? 503 : 400 },
      );
    }
    return Response.json(await response.json());
  } catch {
    return Response.json(
      { error: "검색 서버에 연결할 수 없어요. Elasticsearch와 AI 서버를 확인해 주세요." },
      { status: 503 },
    );
  }
}

