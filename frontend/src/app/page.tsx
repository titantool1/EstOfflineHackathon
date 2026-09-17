import { SiteHeader } from "@/features/navigation/SiteHeader";
import { MissionPreviews } from "@/features/home/MissionPreviews";
import { HomeProgress } from "@/features/home/HomeProgress";
import Link from "next/link";

export default function Home() {
  return <div className="min-h-screen bg-[#f5f8f1]">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-5 py-8 [overflow-wrap:anywhere] md:py-12">
      <section className="relative overflow-hidden rounded-3xl bg-[#2e843b] px-7 py-8 text-white md:px-10 md:py-10">
        <div className="relative z-10 max-w-xl">
          <p className="mb-3 text-sm font-semibold text-[#ccebbd]">오늘의 작은 실천이 지구를 바꿔요</p>
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">오늘은 어떤<br />친환경 행동을 해볼까요?</h1>
          <p className="mt-4 text-sm leading-6 text-[#e4f5db]">관심사에 맞는 미션을 발견하고,<br />참여 조건과 실천할 장소를 함께 확인해요.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/onboarding" className="inline-flex min-h-11 items-center rounded-full bg-white px-5 py-3 text-sm font-bold text-[#28753a]">맞춤 미션 시작하기 →</Link>
            <Link href="/chat" className="inline-flex min-h-11 items-center rounded-full border border-white/50 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">🌱 줍줍이에게 물어보기</Link>
          </div>
        </div>
        <div className="absolute -right-5 -bottom-8 text-[10rem] opacity-25" aria-hidden="true">🌏</div>
      </section>
      <section aria-label="나의 실천과 관심사" className="mt-8 grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <HomeProgress />
        <Link href="/map" className="group rounded-3xl bg-[#eaf5e5] p-6 ring-1 ring-[#dcebd5]">
          <p className="text-sm font-semibold text-[#347c41]">내 주변 에코 실천 장소</p>
          <div className="mt-4 flex items-end justify-between gap-3"><div><h2 className="text-3xl font-bold text-[#246b34]">실천할 장소 찾기</h2><p className="mt-2 text-sm leading-6 text-[#638264]">알아볼 동네를 고르고<br />서울의 등록 장소를 둘러보세요.</p></div><span aria-hidden="true" className="rounded-2xl bg-white p-3 text-2xl">📍</span></div>
        </Link>
      </section>
      <MissionPreviews />
    </main>
  </div>;
}
