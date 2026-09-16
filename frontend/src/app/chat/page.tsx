"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Message = { id: number; role: "bot" | "user"; text: string; };
const starterMessages: Message[] = [{ id: 1, role: "bot", text: "안녕하세요, 윤정원님! 🌱\n서울에서 받을 수 있는 친환경 혜택과 오늘 바로 실천할 수 있는 미션을 찾아드릴게요." }];
const suggestedQuestions = ["텀블러 쓰면 어떤 혜택이 있어?", "내 주변 제로웨이스트 가게 알려줘", "이번 주에 할 수 있는 미션 추천해줘"];

export default function ChatPage() {
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const sendMessage = (text: string) => {
    const question = text.trim();
    if (!question || isThinking) return;
    const userMessage: Message = { id: Date.now(), role: "user", text: question };
    setMessages((current) => [...current, userMessage]);
    setInput(""); setIsThinking(true);
    window.setTimeout(() => { setMessages((current) => [...current, { id: Date.now() + 1, role: "bot", text: "좋은 질문이에요! 현재 확인된 서울 생활권 혜택을 찾아볼게요.\n\n텀블러를 사용하면 참여 매장에서 할인 혜택을 받을 수 있고, 탄소중립포인트 녹색생활실천 참여 여부도 함께 확인해볼 수 있어요." }]); setIsThinking(false); }, 600);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); sendMessage(input); };

  return <div className="min-h-screen bg-[#f5f8f1]"><header className="border-b border-[#e5eddc] bg-white/90"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"><Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link><nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions">에코 미션</Link><Link href="/map">실천 지도</Link><Link href="/chat" className="font-bold text-[#287b39]">줍줍이 챗봇</Link></nav><Link href="/profile" className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">내 프로필</Link></div></header><main className="mx-auto grid max-w-6xl gap-5 px-5 py-8 lg:grid-cols-[1fr_280px]"><section className="flex min-h-[650px] flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e2ebdc]"><div className="flex items-center gap-3 border-b border-[#e8eee3] p-5"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f5e1] text-xl">🌿</span><div><h1 className="font-bold">줍줍이</h1><p className="mt-0.5 text-xs text-[#5f9a55]">● 친환경 혜택 추천 도우미</p></div></div><div className="flex-1 space-y-5 overflow-y-auto bg-[#fafcf8] p-5">{messages.map((message) => <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "bot" && <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e6f4df] text-sm">🌱</span>}<p className={`max-w-[78%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-tr-sm bg-[#2f843d] text-white" : "rounded-tl-sm bg-white text-[#3a5139] shadow-sm ring-1 ring-[#e7eee3]"}`}>{message.text}</p></div>)}{isThinking && <div className="flex gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e6f4df] text-sm">🌱</span><div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-[#6d806b] shadow-sm">혜택 정보를 찾고 있어요...</div></div>}</div><form onSubmit={handleSubmit} className="border-t border-[#e8eee3] p-4"><div className="flex gap-2 rounded-2xl bg-[#f3f7f0] p-2"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="궁금한 친환경 혜택을 물어보세요" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-[#93a190]" /><button type="submit" disabled={!input.trim() || isThinking} className="rounded-xl bg-[#2f843d] px-4 py-3 text-sm font-bold text-white disabled:bg-[#b8cbb4]">보내기</button></div></form></section><aside className="space-y-5"><section className="rounded-3xl bg-[#e9f6e4] p-5"><p className="text-sm font-bold text-[#347d3d]">이렇게 물어보세요</p><div className="mt-4 space-y-2">{suggestedQuestions.map((question) => <button key={question} onClick={() => sendMessage(question)} className="w-full rounded-xl bg-white px-3 py-3 text-left text-sm text-[#577256] shadow-sm hover:bg-[#fafff7]">{question}</button>)}</div></section><section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e2ebdc]"><p className="text-sm font-bold">추천 결과 안내</p><p className="mt-3 text-xs leading-5 text-[#728170]">추천은 등록된 공식 정보와 현재 입력한 조건을 바탕으로 제공돼요. 실제 참여 가능 여부는 공식 페이지에서 한 번 더 확인해주세요.</p></section></aside></main></div>;
}
