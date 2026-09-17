const PATHS = new Set(['search/address', 'search/keyword', 'geo/coord2regioncode']);

/** Server-only adapter. Keys and network access are supplied explicitly by the caller. */
export function createKakaoClient({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw TypeError('Kakao REST API key is required');
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1) throw TypeError('Invalid client options');
  return async function maps(path, params) {
    if (!PATHS.has(path)) throw Error('Unsupported Kakao operation');
    const response = await fetchImpl('https://dapi.kakao.com/v2/local/' + path + '.json?' + new URLSearchParams(params), {
      headers: { Authorization: 'KakaoAK ' + apiKey }, signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw Error('Kakao HTTP ' + response.status);
    const body = await response.json();
    if (!Array.isArray(body.documents)) throw Error('Invalid Kakao response');
    // A truncated address response cannot establish a unique administrative region.
    if (path === 'search/address' && body.meta?.is_end === false) throw Error('Incomplete Kakao address result');
    return body.documents;
  };
}
