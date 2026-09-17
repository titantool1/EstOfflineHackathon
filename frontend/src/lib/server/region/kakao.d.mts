import type { Maps } from './index.mjs';
export function createKakaoClient(options: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Maps;
