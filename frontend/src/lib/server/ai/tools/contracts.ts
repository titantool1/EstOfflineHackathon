import type { Evidence } from "../contracts.ts";

export type SearchTool = (query: string, vector: number[], signal: AbortSignal) => Promise<Evidence[]>;
