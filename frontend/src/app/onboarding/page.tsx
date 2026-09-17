import Link from "next/link";
import { InterestSelector } from "@/features/profile/InterestSelector";
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <main className="min-h-screen bg-[#f5f8f1] px-5 py-8 sm:py-12"><div className="mx-auto max-w-6xl">
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-xl font-bold text-[#267a38]"><span aria-hidden="true" className="text-2xl">🌱</span> 에코줍줍</Link>
    <InterestSelector isEditing={mode === "edit"} />
  </div></main>;
}
