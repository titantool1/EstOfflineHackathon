"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

type SearchResult = {
  docId: string;
  docType: "policy" | "action" | "place";
  title: string;
  category: string | null;
  summary: string;
  region: string | null;
  address: string | null;
  conditions: string | null;
  status: string | null;
  sourceCheckedAt: string | null;
  verificationStatus: string | null;
  sourceUrl: string | null;
  needsReview: boolean;
  benefitLinkStatus: string | null;
  latitude: number | null;
  longitude: number | null;
};

type ChatResponse = {
  answer: string;
  results: SearchResult[];
  meta: {
    resultCount: number;
    tookMs: number;
    region: string | null;
    answerMode: "llm" | "template";
    model: string | null;
  };
};

type Message = {
  id: string;
  role: "bot" | "user";
  text: string;
  results?: SearchResult[];
  meta?: ChatResponse["meta"];
  isError?: boolean;
};

const starterMessages: Message[] = [{
  id: "welcome",
  role: "bot",
  text: "안녕하세요! 🌱\n서울에서 받을 수 있는 친환경 혜택과 가까운 실천 장소를 17,828건의 자료에서 찾아드릴게요.",
}];

const suggestedQuestions = [
  "텀블러를 사용하면 받을 수 있는 혜택을 알려줘",
  "서울에서 페트병을 반납할 수 있는 곳을 찾아줘",
  "친환경 자동차 구매 보조금이 궁금해",
];

const typeLabel: Record<SearchResult["docType"], string> = {
  policy: "제도",
  action: "실천·혜택",
  place: "장소",
};

const typeIcon: Record<SearchResult["docType"], string> = {
  policy: "📋",
  action: "🌿",
  place: "📍",
};

function ResultCard({ result }: { result: SearchResult }) {
  const location = result.address ?? result.region;
  const mapParams = new URLSearchParams({
    placeId: result.docId,
    name: result.title,
    address: result.address ?? result.region ?? "주소 정보 없음",
    category: result.category ?? "친환경 실천 장소",
    lat: String(result.latitude),
    lng: String(result.longitude),
    route: "1",
  });
  return (
    <article className="rounded-2xl border border-[#deead9] bg-[#fbfdf9] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#e7f4e1] px-2.5 py-1 text-[11px] font-bold text-[#337640]">
              {typeIcon[result.docType]} {typeLabel[result.docType]}
            </span>
            {result.category && <span className="text-[11px] text-[#758573]">{result.category}</span>}
          </div>
          <h3 className="mt-2 font-bold leading-6 text-[#29472b]">{result.title}</h3>
        </div>
        {result.needsReview && (
          <span className="shrink-0 rounded-full bg-[#fff4d9] px-2 py-1 text-[10px] font-bold text-[#936a18]">확인 필요</span>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#60725e]">{result.summary}</p>
      {location && <p className="mt-3 text-xs text-[#6d806b]">📍 {location}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#849081]">
        {result.sourceCheckedAt && <span>자료 기준일 {result.sourceCheckedAt}</span>}
        {result.verificationStatus && <span>확인 수준 {result.verificationStatus}</span>}
      </div>
      {result.sourceUrl && (
        <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-[#347d40] hover:underline">
          출처 확인하기 ↗
        </a>
      )}
      {result.docType === "place" && typeof result.latitude === "number" && typeof result.longitude === "number" && (
        <Link href={`/map?${mapParams.toString()}`} className="ml-4 mt-3 inline-flex text-xs font-bold text-[#347d40] hover:underline">
          지도에서 경로 보기 →
        </Link>
      )}
    </article>
  );
}
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const sendMessage = async (text: string) => {
    const question = text.trim();
    if (!question || isThinking) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: question }]);
    setInput("");
    setIsThinking(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question, region: "서울특별시" }),
      });
      const payload = (await response.json()) as ChatResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "검색에 실패했습니다.");
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "bot",
        text: payload.answer,
        results: payload.results,
        meta: payload.meta,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "bot",
        text: error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.",
        isError: true,
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  return (
    <div className="min-h-screen bg-[#f5f8f1]">
      <header className="border-b border-[#e5eddc] bg-white/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
          <nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions">에코 미션</Link><Link href="/map">실천 지도</Link><Link href="/chat" className="font-bold text-[#287b39]">줍줍이 챗봇</Link></nav>
          <span className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">서울특별시 기준</span>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-8 lg:grid-cols-[1fr_300px]">
        <section className="flex min-h-[680px] flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e2ebdc]">
          <div className="flex items-center justify-between gap-3 border-b border-[#e8eee3] p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f5e1] text-xl">🌿</span>
              <div><h1 className="font-bold">줍줍이</h1><p className="mt-0.5 text-xs text-[#5f9a55]">● Elasticsearch 친환경 검색 도우미</p></div>
            </div>
            <span className="hidden rounded-full bg-[#f0f6ed] px-3 py-1.5 text-[11px] font-semibold text-[#668064] sm:inline">BM25 + 벡터 검색</span>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto bg-[#fafcf8] p-5" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "bot" && <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e6f4df] text-sm">🌱</span>}
                <div className={`max-w-[88%] ${message.role === "user" ? "sm:max-w-[72%]" : "w-full sm:max-w-[84%]"}`}>
                  <p className={`whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-tr-sm bg-[#2f843d] text-white" : message.isError ? "rounded-tl-sm bg-[#fff5f0] text-[#8c4934] ring-1 ring-[#f0d8ce]" : "rounded-tl-sm bg-white text-[#3a5139] shadow-sm ring-1 ring-[#e7eee3]"}`}>{message.text}</p>
                  {message.results && message.results.length > 0 && (
                    <div className="mt-3 space-y-2.5">
                      {message.results.map((result) => <ResultCard key={result.docId} result={result} />)}
                      {message.meta && <p className="px-1 text-right text-[10px] text-[#8a9688]">{message.meta.answerMode === "llm" ? `${message.meta.model ?? "LLM"} 답변 · ` : "검색 요약 · "}{message.meta.resultCount}건 · {message.meta.tookMs.toLocaleString()}ms</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isThinking && <div className="flex gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e6f4df] text-sm">🌱</span><div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-[#6d806b] shadow-sm"><span className="inline-flex gap-1"><span className="animate-pulse">●</span><span className="animate-pulse [animation-delay:150ms]">●</span><span className="animate-pulse [animation-delay:300ms]">●</span></span><span className="ml-2">관련 정책과 장소를 찾고 있어요</span></div></div>}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit} className="border-t border-[#e8eee3] p-4">
            <div className="flex gap-2 rounded-2xl bg-[#f3f7f0] p-2">
              <label htmlFor="chat-question" className="sr-only">친환경 혜택 질문</label>
              <input id="chat-question" value={input} maxLength={500} onChange={(event) => setInput(event.target.value)} placeholder="예: 성동구에서 폐건전지를 어디에 반납해?" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-[#93a190]" />
              <button type="submit" disabled={!input.trim() || isThinking} className="rounded-xl bg-[#2f843d] px-4 py-3 text-sm font-bold text-white disabled:bg-[#b8cbb4]">보내기</button>
            </div>
          </form>
        </section>
        <aside className="space-y-5">
          <section className="rounded-3xl bg-[#e9f6e4] p-5">
            <p className="text-sm font-bold text-[#347d3d]">이렇게 물어보세요</p>
            <div className="mt-4 space-y-2">{suggestedQuestions.map((question) => <button key={question} type="button" onClick={() => void sendMessage(question)} disabled={isThinking} className="w-full rounded-xl bg-white px-3 py-3 text-left text-sm leading-5 text-[#577256] shadow-sm hover:bg-[#fafff7] disabled:opacity-50">{question}</button>)}</div>
          </section>
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e2ebdc]">
            <p className="text-sm font-bold">검색 결과 안내</p>
            <p className="mt-3 text-xs leading-5 text-[#728170]">정책·행동·장소 17,828건에서 키워드와 의미를 함께 검색해요. 장소 등록이 실제 포인트 지급을 보장하지는 않아요.</p>
            <div className="mt-4 border-t border-[#e8eee3] pt-4 text-[11px] leading-5 text-[#849081]">기준일과 공식 출처를 확인한 뒤 참여해 주세요.</div>
          </section>
        </aside>
      </main>
    </div>
  );
}
