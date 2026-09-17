import { test } from "node:test";
import assert from "node:assert/strict";
import { searchPlaces } from "../src/lib/server/map/places.ts";
import { requestPlaces } from "../src/features/map/api.ts";

const neighborhood = (sido = "서울", sigungu = "성동구") => ({ regionCode: "1120011400", sido, sigungu, dong: "성수동1가" });
const req = (body: Record<string, unknown> = {}, cookie = "ECOTEAMSESSION=member-a", signal?: AbortSignal) => new Request("http://web/api/places", {
  method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify({ useNeighborhood: true, browseDistrict: "마포구", ...body }), signal,
});
const result = () => Response.json({ data: { results: [], meta: { resultCount: 0, tookMs: 0 } }, error: null, requestId: "places" });
const profile = (init: RequestInit | undefined, value: ReturnType<typeof neighborhood> | null, status = 200) => {
  const requestId = new Headers(init?.headers).get("X-Request-Id");
  return Response.json({ data: status === 200 ? { neighborhood: value } : null, error: status === 200 ? null : { code: "UNAVAILABLE", message: "Unavailable" }, requestId }, { status, headers: { "X-Request-Id": requestId! } });
};

test("map uses the current member's saved region ahead of stale browse district without persisting it", async () => {
  for (const [cookie, saved] of [["ECOTEAMSESSION=member-a", neighborhood()], ["ECOTEAMSESSION=member-b", neighborhood("부산광역시", "중구")]] as const) {
    const calls: string[] = [];
    const response = await searchPlaces(req({}, cookie), { fetch: async (input, init) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if (url.pathname === "/api/profile/neighborhood") {
        assert.equal(new Headers(init?.headers).get("Cookie"), cookie);
        assert.equal(init?.cache, "no-store");
        return profile(init, saved);
      }
      assert.equal(new Headers(init?.headers).get("Cookie"), null);
      assert.equal(url.searchParams.get("region"), saved.sido === "서울" ? "서울특별시" : saved.sido);
      assert.equal(url.searchParams.get("district"), saved.sigungu);
      return result();
    } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(calls, ["/api/profile/neighborhood", "/api/places"]);
    const payload = await response.json();
    assert.equal(payload.meta.region.sigungu, saved.sigungu);
    assert.equal(JSON.stringify(payload).includes("성수동1가"), false);
  }
});

test("explicit location and full reset skip the member lookup", async () => {
  for (const explicit of [true, false]) {
    const response = await searchPlaces(req(explicit ? { query: "홍대", interpretRegion: true } : { useNeighborhood: false, browseDistrict: "" }), {
      resolveQuery: async () => ({ query: "", region: { sido: "서울특별시", sigungu: "마포구" } }),
      fetch: async input => {
        const url = new URL(String(input)); assert.equal(url.pathname, "/api/places");
        assert.equal(url.searchParams.get("district"), explicit ? "마포구" : null);
        return result();
      },
    });
    assert.equal(response.status, 200);
  }
});

test("activity-only search keeps the saved district", async () => {
  const response = await searchPlaces(req({ query: "텀블러", interpretRegion: true }), {
    resolveQuery: async () => ({ query: "텀블러", region: null }),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/profile/neighborhood") return profile(init, neighborhood("서울특별시"));
      assert.equal(url.searchParams.get("district"), "성동구");
      assert.equal(url.searchParams.get("query"), "텀블러");
      return result();
    },
  });
  assert.equal(response.status, 200);
});

test("guest, absent, expired and unavailable profiles retain a usable public default", async () => {
  for (const mode of ["guest", "none", "401", "503", "network", "invalid"]) {
    let lookups = 0;
    const response = await searchPlaces(req({ browseDistrict: "" }, mode === "guest" ? "" : undefined), { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/profile/neighborhood") {
        lookups++;
        if (mode === "network") throw Error("offline");
        if (mode === "invalid") return Response.json({ untrusted: true });
        return profile(init, null, mode === "none" ? 200 : Number(mode));
      }
      assert.equal(url.searchParams.get("district"), null);
      return result();
    } });
    assert.equal(response.status, 200, mode);
    assert.equal(lookups, mode === "guest" ? 0 : 1);
  }
});

test("reset cancellation during profile lookup cannot start a late place search", async () => {
  const controller = new AbortController();
  const response = await searchPlaces(req({}, undefined, controller.signal), { fetch: async (input, init) => {
    assert.equal(new URL(String(input)).pathname, "/api/profile/neighborhood");
    controller.abort();
    return profile(init, neighborhood());
  } });
  assert.equal(response.status, 499);
});

test("client sends opt-in only for default browsing; invalid flags cannot reach Spring", async () => {
  for (const useNeighborhood of [true, false]) {
    await requestPlaces("", { useNeighborhood, fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.useNeighborhood, useNeighborhood ? true : undefined);
      assert.equal(body.interpretRegion, false);
      return Response.json({ results: [], meta: { resultCount: 0, tookMs: 0 } });
    } });
  }
  const response = await searchPlaces(req({ useNeighborhood: "member-b" }), { fetch: async () => { throw Error("must not fetch"); } });
  assert.equal(response.status, 400);
});
