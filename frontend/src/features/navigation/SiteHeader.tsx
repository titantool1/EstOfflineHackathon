"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

const destinations = [["/", "홈"], ["/missions", "에코 미션"], ["/map", "실천 지도"], ["/chat", "줍줍이 챗봇"]] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => { if (menu.current) menu.current.open = false; };
  const links = destinations.map(([href, label]) => <Link key={href} href={href} onClick={close}
    aria-current={(href === "/" ? pathname === href : pathname.startsWith(href)) ? "page" : undefined}
    className="flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium text-[#527051] hover:bg-[#edf5e9] aria-[current=page]:bg-[#e9f5e2] aria-[current=page]:font-bold aria-[current=page]:text-[#287b39]">{label}</Link>);

  return <header className="relative z-30 shrink-0 border-b border-[#e5eddc] bg-white">
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-5">
      <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 font-bold text-[#267a38]"><span aria-hidden="true" className="text-xl">🌱</span> 에코줍줍</Link>
      <nav aria-label="주 메뉴" className="hidden gap-1 md:flex">{links}</nav>
      <div className="flex items-center gap-2">
        <Link href="/profile" className="flex min-h-11 items-center rounded-full bg-[#e9f5e2] px-3 text-xs font-semibold text-[#2d7938]">내 프로필</Link>
        <details ref={menu} className="md:hidden" onKeyDown={event => {
          if (event.key === "Escape") { close(); menu.current?.querySelector("summary")?.focus(); }
        }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
          <summary aria-label="모바일 메뉴" className="flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-[#dce8d7] px-3 text-sm font-bold text-[#347d40] [&::-webkit-details-marker]:hidden">메뉴</summary>
          <nav aria-label="모바일 주 메뉴" className="absolute inset-x-0 top-full max-h-[60dvh] overflow-y-auto border-b border-[#dce8d7] bg-white p-3 shadow-lg">{links}</nav>
        </details>
      </div>
    </div>
  </header>;
}
