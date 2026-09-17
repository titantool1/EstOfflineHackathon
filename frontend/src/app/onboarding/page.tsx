import Link from "next/link";
import { InterestSelector } from "@/features/profile/InterestSelector";

export default function OnboardingPage() {
  return <main className="min-h-screen bg-[#f5f8f1] px-5 py-8 sm:py-12">
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="inline-flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
      <InterestSelector />
    </div>
  </main>;
}
