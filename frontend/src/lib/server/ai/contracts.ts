export type Evidence = { id: string; text: string };
export type AnswerModel = (query: string, evidence: Evidence[], signal: AbortSignal) => Promise<string>;
export type EmbedQuery = (query: string, signal: AbortSignal) => Promise<number[]>;

export class AiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "AiError";
    this.code = code;
  }
}
