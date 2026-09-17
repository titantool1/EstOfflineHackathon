"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createChatClient } from "./chat-client";
import type { ChatProgress } from "../../lib/chat-stream";
import { SourceText } from "../sources/SourceText";

type Message = { id: string; role: "assistant" | "user"; text: string; isError?: boolean };
const welcome: Message = { id: "welcome", role: "assistant", text: "안녕하세요! 친환경 제도와 실천 방법을 함께 찾아볼게요. 무엇이 궁금한가요?" };
const suggestions = ["텀블러를 사용하면 받을 수 있는 혜택을 알려줘", "친환경 자동차 구매 지원이 궁금해", "일상에서 탄소를 줄이는 방법을 알려줘"];

const progressLabels: Record<ChatProgress, string> = {
  thinking: "질문을 살펴보고 있어요…", searching: "관련 정보를 검색하고 있어요…",
  reading: "선택한 제도의 상세를 읽고 있어요…", checking_conditions: "필요한 회원 조건을 확인하고 있어요…",
  updating_conditions: "말씀하신 조건을 이번 상담에 반영하고 있어요…", answering: "답변을 작성하고 있어요…",
};

export function ChatPanel() {
  const client = useRef(createChatClient()).current;
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [conversationId, setConversationId] = useState<string>();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [needsNewConversation, setNeedsNewConversation] = useState(false);
  const [draft, setDraft] = useState("");
  const [progress, setProgress] = useState<ChatProgress>("thinking");
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { activeRequest.current?.abort(); }, []);
  const history = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = history.current;
    if (node) node.scrollTop = messages.length === 1 && !isThinking ? 0 : node.scrollHeight;
  }, [messages, isThinking, draft, progress]);
  useEffect(() => {
    const node = composer.current;
    if (node) { node.style.height = "auto"; node.style.height = `${Math.min(node.scrollHeight, 96)}px`; }
  }, [input]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || activeRequest.current || isThinking || needsNewConversation) return;
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "user", text: question }]);
    const request = new AbortController();
    activeRequest.current = request;
    setIsThinking(true); setDraft(""); setProgress("thinking");
    try {
      const answer = await client.send(question, conversationId, { signal: request.signal, onEvent: event => {
        if (request.signal.aborted) return;
        if (event.type === "reset") setDraft("");
        else if (event.type === "delta") setDraft(current => current + event.text);
        else setProgress(event.stage);
      } });
      if (request.signal.aborted) return;
      setConversationId(answer.conversationId);
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: answer.message.text }]);
      setInput("");
    } catch (error) {
      if (request.signal.aborted) return;
      setInput(question);
      setNeedsNewConversation(true);
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", isError: true,
        text: error instanceof Error ? error.message : "답변을 만들지 못했어요. 새 상담에서 다시 질문해 주세요." }]);
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
      if (!request.signal.aborted) { setDraft(""); setIsThinking(false); }
    }
  }
  async function startNew() {
    if (conversationId) { try { await client.close(conversationId); } catch {} }
    setConversationId(undefined); setNeedsNewConversation(false); setMessages([welcome]);
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e2ebdc]">
    <div className="flex shrink-0 items-center justify-between border-b border-[#e8eee3] p-3 sm:p-5">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f5e1] text-xl">🌿</span>
        <div><h1 className="font-bold">줍줍이</h1><p className="mt-0.5 text-xs text-[#5f9a55]">친환경 제도·실천 상담</p></div></div>
      <button type="button" onClick={() => void startNew()} disabled={isThinking} className="rounded-xl border border-[#dce8d7] min-h-11 px-3 py-2 text-xs font-bold text-[#347d40] disabled:opacity-50">새 상담</button>
    </div>
    <div ref={history} role="log" aria-label="상담 대화" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-[#fafcf8] p-3 sm:p-5" aria-live="polite">
      {messages.map(message => <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
        {message.role === "assistant" && <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e6f4df] text-sm">🌱</span>}
        <p className={`min-w-0 max-w-[84%] [overflow-wrap:anywhere] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-tr-sm bg-[#2f843d] text-white" : message.isError ? "rounded-tl-sm bg-[#fff5f0] text-[#8c4934] ring-1 ring-[#f0d8ce]" : "rounded-tl-sm bg-white text-[#3a5139] shadow-sm ring-1 ring-[#e7eee3]"}`}>
          {message.role === "assistant" && !message.isError ? <SourceText text={message.text} /> : message.text}
        </p>
      </div>)}
      {isThinking && <div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e6f4df]">🌱</span>
        <div className="min-w-0 max-w-[84%] [overflow-wrap:anywhere] rounded-2xl bg-white px-4 py-3 text-sm text-[#6d806b]" aria-busy="true">
          <p role="status">{progressLabels[progress]}</p>
          {draft && <><p className="mt-1 text-xs">작성 중인 답변</p><p className="mt-2 whitespace-pre-wrap break-words text-[#3a5139]" aria-live="off">{draft}</p></>}
        </div></div>}
      {needsNewConversation && <button type="button" onClick={() => void startNew()} className="rounded-xl bg-[#2f843d] px-4 py-2 text-sm font-bold text-white">새 상담 시작하기</button>}
    {!conversationId && !needsNewConversation && <div className="border-t border-[#eef3ea] p-4"><p className="mb-2 text-xs font-bold text-[#668064]">이렇게 물어보세요</p><div className="flex flex-wrap gap-2">{suggestions.map(question => <button key={question} type="button" onClick={() => void send(question)} disabled={isThinking} className="rounded-full bg-[#eef6ea] px-3 py-2 text-xs text-[#477248]">{question}</button>)}</div></div>}
      <p className="text-xs leading-5 text-[#728170]">공식 출처와 최신 기준은 답변에 연결된 자료에서 다시 확인해 주세요. 현재 상담은 서버가 다시 시작되면 이어지지 않습니다.</p>
    </div>
    <form onSubmit={submit} className="shrink-0 border-t border-[#e8eee3] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4">
      <div className="flex gap-2 rounded-2xl bg-[#f3f7f0] p-2"><label htmlFor="chat-question" className="sr-only">친환경 질문</label>
        <textarea ref={composer} rows={1} id="chat-question" value={input} maxLength={2000} onChange={event => setInput(event.target.value)} disabled={isThinking || needsNewConversation}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229
                && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
              event.preventDefault(); void send(input);
            }
          }}
          placeholder="예: 다회용기를 쓰면 어떤 혜택이 있어?" className="min-h-11 max-h-24 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 outline-none disabled:opacity-60" />
        <button type="submit" disabled={!input.trim() || isThinking || needsNewConversation} className="min-h-11 shrink-0 self-end rounded-xl bg-[#2f843d] px-4 py-3 text-sm font-bold text-white disabled:bg-[#b8cbb4]">보내기</button></div>
    </form>

  </section>;
}
