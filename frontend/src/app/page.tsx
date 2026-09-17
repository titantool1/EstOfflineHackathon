import Link from "next/link";

const missions = [
  { icon: "🥤", category: "다회용품", title: "텀블러로 음료 주문하기", reward: "탄소중립포인트 적립", color: "bg-[#eff8df]" },
  { icon: "♻️", category: "자원순환", title: "투명 페트병 분리배출", reward: "자원순환 혜택 확인", color: "bg-[#f7f3df]" },
  { icon: "🚶", category: "친환경 이동", title: "가까운 길은 걸어가기", reward: "기후동행 실천", color: "bg-[#e9f6e7]" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f5f8f1]">
      <header className="border-b border-[#e5eddc] bg-white/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
          <nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions">에코 미션</Link><Link href="/map">실천 지도</Link><Link href="/chat">줍줍이 챗봇</Link></nav>
          <Link href="/profile" className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">내 프로필</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">
        <section className="relative overflow-hidden rounded-3xl bg-[#2e843b] px-7 py-8 text-white md:px-10 md:py-10">
          <div className="relative z-10 max-w-xl"><p className="mb-3 text-sm font-semibold text-[#ccebbd]">오늘의 작은 실천이 지구를 바꿔요</p><h1 className="text-3xl font-bold leading-tight md:text-4xl">윤정원님, 오늘은 어떤<br />친환경 행동을 해볼까요?</h1><p className="mt-4 text-sm leading-6 text-[#e4f5db]">내 관심사와 서울 생활권 혜택을 바탕으로<br className="hidden sm:block" /> 지금 시작할 수 있는 실천을 골라드릴게요.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/onboarding" className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-bold text-[#28753a]">맞춤 미션 시작하기 →</Link><Link href="/chat" className="inline-flex rounded-full border border-white/50 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">🌱 줍줍이에게 물어보기</Link></div></div>
          <div className="absolute -right-5 -bottom-8 text-[10rem] opacity-25" aria-hidden="true">🌏</div>
        </section>
        <section className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#e6ecdf]"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-[#418347]">이번 주 에코 실천</p><p className="mt-1 text-2xl font-bold">67%</p></div><span className="rounded-full bg-[#edf7e9] px-3 py-1 text-xs font-bold text-[#347d3d]">3일 연속 실천 중</span></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e8eee5]"><div className="h-full w-2/3 rounded-full bg-[#65b84c]" /></div><div className="mt-5 grid grid-cols-7 gap-2 text-center text-[11px] text-[#759070]">{["월", "화", "수", "목", "금", "토", "일"].map((day, index) => <div key={day}><div className={`mx-auto mb-2 h-7 w-7 rounded-full ${index < 4 ? "bg-[#67b74f]" : "bg-[#edf1e9]"}`} />{day}</div>)}</div></div>
          <Link href="/map" className="group rounded-3xl bg-[#eaf5e5] p-6 ring-1 ring-[#dcebd5]"><p className="text-sm font-semibold text-[#347c41]">내 주변 에코 실천 장소</p><div className="mt-4 flex items-end justify-between"><div><p className="text-3xl font-bold text-[#246b34]">12곳</p><p className="mt-1 text-sm text-[#638264]">서울 마포구 기준</p></div><span className="rounded-2xl bg-white p-3 text-2xl transition-transform group-hover:-translate-y-1">📍</span></div></Link>
        </section>
        <section className="mt-10"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold">오늘의 에코미션</h2><p className="mt-1 text-sm text-[#6a8068]">가볍게 시작하고, 혜택도 챙겨보세요.</p></div><Link href="/missions" className="text-sm font-semibold text-[#398346]">전체 보기 →</Link></div><div className="grid gap-4 md:grid-cols-3">{missions.map((mission) => <article key={mission.title} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e6ecdf]"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${mission.color}`}>{mission.icon}</div><p className="mt-5 text-xs font-bold text-[#5c9c4e]">{mission.category}</p><h3 className="mt-1 text-lg font-bold">{mission.title}</h3><p className="mt-3 text-sm text-[#687d66]">{mission.reward}</p><button className="mt-5 w-full rounded-xl bg-[#eaf5e5] py-3 text-sm font-bold text-[#367c40]">자세히 보기</button></article>)}</div></section>
      </main>
    </div>
  );
}
