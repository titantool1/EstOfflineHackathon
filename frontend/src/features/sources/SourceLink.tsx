"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { safeSourceUrl, sourceDomain, type SourceReference } from "./source-reference";

type SourceLinkProps = { source: SourceReference; label?: string; className?: string };

export function SourceLink({ source, label = source.title, className = "" }: SourceLinkProps) {
  const href = safeSourceUrl(source.url);
  const domain = href ? sourceDomain(href) : null;
  const tooltipId = useId();
  const anchor = useRef<HTMLAnchorElement>(null);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const close = () => setPosition(null);
  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
      ...(below >= 160 || below >= rect.top
        ? { top: rect.bottom + 4, maxHeight: Math.max(40, below - 12) }
        : { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.max(40, rect.top - 12) }) });
  };
  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { window.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, [position]);

  if (!href || !domain) return <span className={`[overflow-wrap:anywhere] ${className}`}>{label}</span>;
  return <span className="source-reference inline [overflow-wrap:anywhere]" onPointerEnter={event => { if (event.pointerType === "mouse") show(); }} onPointerLeave={close}>
    <a ref={anchor} href={href} target="_blank" rel="noopener noreferrer" aria-describedby={position ? tooltipId : undefined}
      onFocus={() => { if (window.matchMedia("(hover: hover)").matches) show(); }} onBlur={close}
      onKeyDown={event => { if (event.key === "Escape") close(); }}
      className={`source-link font-semibold text-[#287b39] underline decoration-[#8fbf8a] underline-offset-2 hover:text-[#1f642d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#287b39] ${className}`}>
      {label}<span aria-hidden="true"> ↗</span><span className="source-domain"> ({domain})</span>
    </a>
    {position && createPortal(<span id={tooltipId} role="tooltip" style={position}
      className="pointer-events-none fixed z-50 w-[280px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl bg-[#243c28] px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg [overflow-wrap:anywhere]">
      <span className="block font-bold">{source.title || label}</span>
      {source.description && <span className="mt-0.5 block text-[#dcebdc]">{source.description}</span>}
      <span className="mt-0.5 block text-[#bcd6bd]">{domain}</span>
    </span>, document.body)}
  </span>;
}
