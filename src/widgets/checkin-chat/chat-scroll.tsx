"use client";

import { useEffect, useRef, type ReactNode, type UIEvent } from "react";

interface ChatScrollProps {
  children: ReactNode;
  messageCount: number;
}

const AUTO_SCROLL_THRESHOLD = 72;

export function ChatScroll({ children, messageCount }: ChatScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !shouldFollowRef.current) return;

    const frame = requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frame);
  }, [messageCount]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!shouldFollowRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      });
    });
    observer.observe(content);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldFollowRef.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
  };

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6"
      onScroll={handleScroll}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="체크인 대화"
    >
      <div ref={contentRef} className="mx-auto flex w-full max-w-[480px] flex-col gap-4">{children}</div>
    </div>
  );
}

