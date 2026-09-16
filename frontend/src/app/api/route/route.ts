type RouteRequest = {
  origin?: { latitude?: unknown; longitude?: unknown };
  destination?: { latitude?: unknown; longitude?: unknown };
};

type KakaoRoad = { vertexes?: number[] };
type KakaoSection = { roads?: KakaoRoad[] };
type KakaoRoute = {
  result_code?: number;
  result_msg?: string;
  summary?: { distance?: number; duration?: number };
  sections?: KakaoSection[];
};

function coordinate(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function samplePath(points: { latitude: number; longitude: number }[], limit = 2000) {
  if (points.length <= limit) return points;
  const sampled = Array.from({ length: limit - 1 }, (_, index) => (
    points[Math.floor((index * (points.length - 1)) / (limit - 1))]
  ));
  sampled.push(points[points.length - 1]);
  return sampled;
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "JSON 요청만 지원합니다." }, { status: 415 });
  }

  let body: RouteRequest;
  try {
    body = (await request.json()) as RouteRequest;
  } catch {
    return Response.json({ error: "요청 형식을 확인해 주세요." }, { status: 400 });
  }

  const originLatitude = coordinate(body.origin?.latitude, -90, 90);
  const originLongitude = coordinate(body.origin?.longitude, -180, 180);
  const destinationLatitude = coordinate(body.destination?.latitude, -90, 90);
  const destinationLongitude = coordinate(body.destination?.longitude, -180, 180);
  if ([originLatitude, originLongitude, destinationLatitude, destinationLongitude].some((value) => value === null)) {
    return Response.json({ error: "출발지와 목적지 좌표를 확인해 주세요." }, { status: 400 });
  }

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "카카오모빌리티 REST API 키가 설정되지 않았어요.", code: "ROUTE_KEY_MISSING" },
      { status: 503 },
    );
  }

  const params = new URLSearchParams({
    origin: `${originLongitude},${originLatitude}`,
    destination: `${destinationLongitude},${destinationLatitude}`,
    priority: "RECOMMEND",
    alternatives: "false",
    road_details: "false",
  });

  try {
    const response = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?${params}`, {
      headers: { Authorization: `KakaoAK ${apiKey}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return Response.json(
        { error: response.status === 401 || response.status === 403 ? "카카오모빌리티 REST API 키 또는 권한을 확인해 주세요." : "경로를 계산하지 못했어요." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as { routes?: KakaoRoute[] };
    const route = payload.routes?.[0];
    if (!route || route.result_code !== 0) {
      return Response.json({ error: route?.result_msg ?? "이동 가능한 경로를 찾지 못했어요." }, { status: 404 });
    }

    const path = (route.sections ?? []).flatMap((section) =>
      (section.roads ?? []).flatMap((road) => {
        const vertexes = road.vertexes ?? [];
        const points: { latitude: number; longitude: number }[] = [];
        for (let index = 0; index + 1 < vertexes.length; index += 2) {
          points.push({ longitude: vertexes[index], latitude: vertexes[index + 1] });
        }
        return points;
      }),
    );
    if (path.length < 2) {
      return Response.json({ error: "표시할 수 있는 경로 좌표가 없어요." }, { status: 404 });
    }

    return Response.json({
      path: samplePath(path),
      distanceMeters: route.summary?.distance ?? null,
      durationSeconds: route.summary?.duration ?? null,
    });
  } catch {
    return Response.json({ error: "길찾기 서버에 연결할 수 없어요." }, { status: 503 });
  }
}
