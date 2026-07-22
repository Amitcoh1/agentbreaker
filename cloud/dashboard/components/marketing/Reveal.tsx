"use client";

import { type ElementType, type ReactNode, useEffect, useRef } from "react";

// Reveal-on-scroll: adds `.in` when the element crosses into view (threshold .18, matching the
// design). prefers-reduced-motion is handled in CSS (reveals render visible with no transition).
export function useReveal() {
  const ref = useRef<any>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("in");
            io.unobserve(el);
          }
        }),
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function Reveal({
  as,
  className = "",
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  const Tag = as ?? "div";
  const ref = useReveal();
  return (
    <Tag ref={ref} className={`reveal${className ? ` ${className}` : ""}`}>
      {children}
    </Tag>
  );
}
