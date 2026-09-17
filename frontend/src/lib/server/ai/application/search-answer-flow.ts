import "server-only";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { AiError } from "../contracts.ts";
import type { AnswerModel, EmbedQuery, Evidence } from "../contracts.ts";
import type { SearchTool } from "../tools/contracts.ts";

const State = Annotation.Root({
  query: Annotation<string>(),
  vector: Annotation<number[]>(),
  evidence: Annotation<Evidence[]>(),
  answer: Annotation<string>(),
});

// This is the current fixed embed -> search -> answer application flow.
// It does not implement an SDK function-calling loop or own DB/ES access or user memory.
export function createSearchAnswerGraph(ports: { embed: EmbedQuery; search: SearchTool; answer: AnswerModel }) {
  return async (query: string, signal: AbortSignal = AbortSignal.timeout(90_000)) => {
    if (!query.trim() || query.length > 2000) throw new AiError("INVALID_QUERY");
    const graph = new StateGraph(State)
      .addNode("embed", async (state) => {
        signal.throwIfAborted();
        return { vector: await ports.embed(state.query, signal) };
      })
      .addNode("search", async (state) => {
        signal.throwIfAborted();
        const evidence = await ports.search(state.query, state.vector, signal);
        if (!Array.isArray(evidence) || evidence.length > 10 || evidence.some((item) =>
          !item || typeof item.id !== "string" || !item.id.trim() || typeof item.text !== "string"
          || !item.text.trim() || item.text.length > 4000)) throw new AiError("INVALID_SEARCH_RESULT");
        return { evidence };
      })
      .addNode("compose", async (state) => {
        signal.throwIfAborted();
        const answer = await ports.answer(state.query, state.evidence, signal);
        if (!answer.trim()) throw new AiError("EMPTY_MODEL_RESPONSE");
        return { answer };
      })
      .addNode("no_results", () => ({ answer: "확인할 수 있는 자료를 찾지 못했어요. 검색 조건을 바꿔 주세요." }))
      .addEdge(START, "embed").addEdge("embed", "search")
      .addConditionalEdges("search", (state) => state.evidence.length ? "compose" : "no_results")
      .addEdge("compose", END).addEdge("no_results", END).compile();
    const result = await graph.invoke({ query: query.trim() }, { signal, recursionLimit: 8 });
    return { answer: result.answer, evidence: result.evidence };
  };
}
