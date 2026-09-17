"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useChatAuthenticationExpired } from "./ChatAuthentication";
import { ChatClientError, createChatClient, type ChatSaveStatus } from "./chat-client";
import { forgetChatSession, newChatSession, storedChatSession } from "./chat-session.ts";
import type { ChatProgress } from "../../lib/chat-stream";
import { SourceText } from "../sources/SourceText";

type Message = { id: string; role: "assistant" | "user"; text: string; isError?: boolean };
const welcome: Message = { id: "welcome", role: "assistant", text: "안녕하세요! 친환경 제도와 실천 방법을 함께 찾아볼게요. 무엇이 궁금한가요?" };
const suggestions = ["텀블러를 사용하면 받을 수 있는 혜택을 알려줘", "친환경 자동차 구매 지원이 궁금해", "일상에서 탄소를 줄이는 방법을 알려줘"];
const closeNotices: Record<ChatSaveStatus, string> = {
  saved: "변경한 정보가 저장되었습니다. 새 상담을 시작했어요.",
  no_changes: "새 상담을 시작했어요.",
  pending_resolution: "새 상담을 시작했어요. 이전 상담에서 확인되지 않은 변경은 저장하지 않았어요.",
  rejected: "변경한 정보를 저장하지 못했습니다. 기존 정보는 유지되며 새 상담을 시작했어요.",
  outcome_unconfirmed: "새 상담을 시작했어요. 이전 상담의 정보 저장 결과는 확인하지 못했어요.",
};

const progressLabels: Record<ChatProgress, string> = {
  thinking: "질문을 살펴보고 있어요…", searching: "관련 정보를 검색하고 있어요…",
  reading: "선택한 제도의 상세를 읽고 있어요…", checking_conditions: "필요한 회원 조건을 확인하고 있어요…",
  updating_conditions: "말씀하신 조건을 이번 상담에 반영하고 있어요…", answering: "답변을 작성하고 있어요…",
};

export function ChatPanel({ initialQuestion = "" }: { initialQuestion?: string }) {
  const authenticationExpired = useChatAuthenticationExpired();
  const client = useRef(createChatClient()).current;
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [sessionNotice, setSessionNotice] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [input, setInput] = useState(initialQuestion);
  const [isThinking, setIsThinking] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const clientSession = useRef<string | undefined>(undefined);
  const [needsNewConversation, setNeedsNewConversation] = useState(false);
  const [draft, setDraft] = useState("");
  const [progress, setProgress] = useState<ChatProgress>("thinking");
  const activeRequest = useRef<AbortController | null>(null);
  const conversation = useRef<string | undefined>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingActivity = useRef(false);
  const closeEpoch = useRef(0);
  useEffect(() => { conversation.current = conversationId; }, [conversationId]);
  useEffect(() => () => {
    activeRequest.current?.abort();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (activityTimer.current) clearTimeout(activityTimer.current);
  }, []);
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

  const clearConversationTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (activityTimer.current) clearTimeout(activityTimer.current);
    idleTimer.current = undefined;
    activityTimer.current = undefined;
    pendingActivity.current = false;
  }, []);
  const resetConversation = useCallback((notice?: string) => {
    clearConversationTimers();
    forgetChatSession(); clientSession.current = undefined;
    conversation.current = undefined;
    setConversationId(undefined); setNeedsNewConversation(false); setInput(initialQuestion); setDraft("");
    setMessages([welcome]);
    setSessionNotice(notice ?? "");
  }, [clearConversationTimers, initialQuestion]);
  const finishConversation = useCallback(async (id: string, epoch: number, fallback?: string) => {
    if (conversation.current !== id || epoch !== closeEpoch.current) return;
    setIsClosing(true); clearConversationTimers();
    let notice = fallback ?? closeNotices.outcome_unconfirmed;
    try {
      const result = await client.close(id);
      notice = closeNotices[result.saveStatus];
    } catch (error) {
      if (error instanceof ChatClientError && (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED")) authenticationExpired?.();
    }
    if (conversation.current === id && epoch === closeEpoch.current) resetConversation(notice);
    if (epoch === closeEpoch.current) setIsClosing(false);
  }, [client, clearConversationTimers, resetConversation, authenticationExpired]);
  const armIdle = useCallback((id: string, delay = 90_000) => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    const epoch = closeEpoch.current;
    idleTimer.current = setTimeout(() => { void finishConversation(id, epoch); }, delay);
  }, [finishConversation]);

  useEffect(() => {
    const controller = new AbortController();
    let poll: ReturnType<typeof setTimeout> | undefined;
    async function restore() {
      const session = clientSession.current ?? storedChatSession();
      if (!session) { setIsRestoring(false); return; }
      clientSession.current = session;
      try {
        const started = performance.now();
        const snapshot = await client.restore(session, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
        if (controller.signal.aborted) return;
        setRestoreError("");
        if (snapshot.state !== "active") {
          resetConversation(snapshot.state === "closed" ? closeNotices[snapshot.saveStatus]
            : "이전 상담을 이어갈 수 없어요. 새 상담을 시작해 주세요.");
          setIsThinking(false);
        } else {
          conversation.current = snapshot.conversationId;
          setConversationId(snapshot.conversationId);
          const restored: Message[] = snapshot.messages.map((message, index) => ({ ...message, id: `restored-${index}` }));
          if (snapshot.pendingMessage) restored.push({ id: "pending", role: "user", text: snapshot.pendingMessage });
          setMessages([welcome, ...restored]);
          setIsThinking(snapshot.generating); setDraft("");
          if (snapshot.generating) poll = setTimeout(() => { void restore(); }, 1000);
          else armIdle(snapshot.conversationId, Math.max(0, (snapshot.remainingIdleMs ?? 0) - (performance.now() - started)));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setIsThinking(false);
        if (error instanceof ChatClientError && error.status === 401 && authenticationExpired) { resetConversation(error.message); authenticationExpired(); }
        else if (error instanceof ChatClientError && [401, 404].includes(error.status)) resetConversation(error.message);
        else setRestoreError("이전 상담을 불러오지 못했어요. 다시 불러와 주세요.");
      } finally { if (!controller.signal.aborted) setIsRestoring(false); }
    }
    void restore();
    return () => { controller.abort(); if (poll) clearTimeout(poll); };
  }, [client, armIdle, resetConversation, restoreAttempt, authenticationExpired]);
  function sendActivity(id: string) {
    if (conversation.current !== id || isThinking || isClosing) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    void client.keepAlive(id, controller.signal).catch(error => {
      if (error instanceof ChatClientError && (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED")) authenticationExpired?.();
    }).finally(() => clearTimeout(timeout));
  }
  function flushActivity(id: string) {
    if (conversation.current !== id || isThinking || isClosing) {
      activityTimer.current = undefined; pendingActivity.current = false; return;
    }
    if (pendingActivity.current) { pendingActivity.current = false; sendActivity(id); }
    activityTimer.current = setTimeout(() => {
      if (pendingActivity.current) flushActivity(id);
      else activityTimer.current = undefined;
    }, 10_000);
  }
  function recordTypingActivity() {
    const id = conversation.current;
    if (!id || isThinking || isClosing) return;
    armIdle(id);
    pendingActivity.current = true;
    // One leading call and repeated trailing calls carry the last real keystroke to the server.
    if (!activityTimer.current) flushActivity(id);
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || activeRequest.current || isThinking || isClosing || isRestoring || restoreError || needsNewConversation) return;
    clearConversationTimers();
    setSessionNotice("");
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "user", text: question }]);
    const request = new AbortController();
    activeRequest.current = request;
    setIsThinking(true); setDraft(""); setProgress("thinking");
    try {
      clientSession.current ??= newChatSession();
      const answer = await client.send(question, conversationId, { clientSessionId: clientSession.current, signal: request.signal, onEvent: event => {
        if (request.signal.aborted) return;
        if (event.type === "reset") setDraft("");
        else if (event.type === "delta") setDraft(current => current + event.text);
        else setProgress(event.stage);
      } });
      if (request.signal.aborted) return;
      conversation.current = answer.conversationId;
      setConversationId(answer.conversationId);
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: answer.message.text }]);
      setInput("");
      armIdle(answer.conversationId);
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof ChatClientError && (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") && authenticationExpired) {
        clearConversationTimers(); authenticationExpired(); return;
      }
      const text = error instanceof Error ? error.message : "답변을 만들지 못했어요. 새 상담에서 다시 질문해 주세요.";
      if (error instanceof ChatClientError && error.status === 401) resetConversation(text);
      else if (clientSession.current) {
        // Navigation can reject fetch before React's cleanup runs. Keep the identifier;
        // only the server can say whether the turn committed, is still running, or ended.
        setIsRestoring(true); setRestoreAttempt(value => value + 1);
      } else resetConversation(text);
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
      if (!request.signal.aborted) { setDraft(""); setIsThinking(false); }
    }
  }
  async function startNew() {
    const id = conversation.current;
    const epoch = ++closeEpoch.current;
    if (id) await finishConversation(id, epoch);
    else resetConversation();
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e2ebdc]">
    <div className="flex shrink-0 items-center justify-between border-b border-[#e8eee3] p-3 sm:p-5">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f5e1] text-xl">🌿</span>
        <div><h1 className="font-bold">줍줍이</h1><p className="mt-0.5 text-xs text-[#5f9a55]">친환경 제도·실천 상담</p></div></div>
      <button type="button" onClick={() => void startNew()} disabled={isThinking || isClosing || isRestoring || !!restoreError} className="rounded-xl border border-[#dce8d7] min-h-11 px-3 py-2 text-xs font-bold text-[#347d40] disabled:opacity-50">새 상담</button>
    </div>
    {sessionNotice && <p role="status" aria-label="상담 상태 안내" className="shrink-0 border-b border-[#e8eee3] bg-[#f3f7f0] px-4 py-3 text-sm leading-6 text-[#526b50]">{sessionNotice}</p>}
    {isRestoring && <p role="status" className="px-4 py-3 text-sm text-[#526b50]">이전 상담을 불러오고 있어요…</p>}
    {restoreError && <div role="alert" className="px-4 py-3 text-sm text-[#8c4934]">{restoreError} <button type="button"
      onClick={() => { setIsRestoring(true); setRestoreError(""); setRestoreAttempt(value => value + 1); }}
      className="font-bold underline">상담 다시 불러오기</button></div>}
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
    {!conversationId && !needsNewConversation && !isRestoring && !restoreError && <div className="border-t border-[#eef3ea] p-4"><p className="mb-2 text-xs font-bold text-[#668064]">이렇게 물어보세요</p><div className="flex flex-wrap gap-2">{suggestions.map(question => <button key={question} type="button" onClick={() => void send(question)} disabled={isThinking} className="rounded-full bg-[#eef6ea] px-3 py-2 text-xs text-[#477248]">{question}</button>)}</div></div>}
      <p className="text-xs leading-5 text-[#728170]">공식 출처와 최신 기준은 답변에 연결된 자료에서 다시 확인해 주세요. 현재 상담은 서버가 다시 시작되면 이어지지 않습니다.</p>
    </div>
    <form onSubmit={submit} className="shrink-0 border-t border-[#e8eee3] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4">
      <div className="flex gap-2 rounded-2xl bg-[#f3f7f0] p-2"><label htmlFor="chat-question" className="sr-only">친환경 질문</label>
        <textarea ref={composer} rows={1} id="chat-question" value={input} maxLength={2000} onChange={event => { setInput(event.target.value); recordTypingActivity(); }} disabled={isThinking || isClosing || isRestoring || !!restoreError || needsNewConversation}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229
                && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
              event.preventDefault(); void send(input);
            }
          }}
          placeholder="예: 다회용기를 쓰면 어떤 혜택이 있어?" className="min-h-11 max-h-24 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 outline-none disabled:opacity-60" />
        <button type="submit" disabled={!input.trim() || isThinking || isClosing || isRestoring || !!restoreError || needsNewConversation} className="min-h-11 shrink-0 self-end rounded-xl bg-[#2f843d] px-4 py-3 text-sm font-bold text-white disabled:bg-[#b8cbb4]">보내기</button></div>
    </form>

  </section>;
}
