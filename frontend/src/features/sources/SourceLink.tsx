"use client";

import { KeyboardEvent, useId, useState } from "react";
import { safeSourceUrl, sourceDomain, type SourceReference } from "./source-reference";

type SourceLinkProps = {
  source: SourceReference;
  label?: string;
  className?: string;
};

export function SourceLink({ source, label = source.title, className = "" }: SourceLinkProps) {
  const href = safeSourceUrl(source.url);
  const domain = href ? sourceDomain(href) : null;
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key === "Escape") setOpen(false);
  };

  if (!href || !domain) return <span className={className}>{label}</span>;
  return <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <a href={href} target="_blank" rel="noopener noreferrer" aria-describedby={tooltipId}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
      className={`font-semibold text-[#287b39] underline decoration-[#8fbf8a] underline-offset-2 hover:text-[#1f642d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#287b39] ${className}`}>
      {label}<span aria-hidden="true"> ↗</span>
    </a>
    <span id={tooltipId} role="tooltip" aria-hidden={!open}
      className={`${open ? "visible opacity-100" : "invisible opacity-0"} absolute bottom-full left-0 z-20 w-64 max-w-[80vw] pb-2 text-left text-xs font-normal leading-5 transition-opacity`}>
      <span className="block rounded-xl bg-[#243c28] px-3 py-2 text-white shadow-lg">
        <span className="block font-bold">{source.title || label}</span>
        {source.description && <span className="mt-0.5 block text-[#dcebdc]">{source.description}</span>}
        <span className="mt-0.5 block break-all text-[#bcd6bd]">{domain}</span>
      </span>
    </span>
  </span>;
}
