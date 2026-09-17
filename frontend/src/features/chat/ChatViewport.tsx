"use client";

import { type ReactNode, useEffect, useRef } from "react";

// VisualViewport also shrinks when the keyboard overlays the layout viewport.
export function ChatViewport({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      // Let the browser handle pinch zoom without reflowing the conversation.
      if (!frame.current || viewport.scale !== 1) return;
      frame.current.style.height = `${viewport.height}px`;
      frame.current.style.top = `${viewport.offsetTop}px`;
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, []);
  return <div ref={frame} className="fixed inset-x-0 top-0 flex h-dvh min-w-0 flex-col overflow-hidden bg-[#f5f8f1]">{children}</div>;
}
