"use client";

import { useEffect, useRef } from "react";

export default function Stats() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reveal = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (el.classList.add("in"), reveal.unobserve(el))),
      { threshold: 0.18 },
    );
    reveal.observe(el);

    const count = new IntersectionObserver(
      (es) => {
        if (!es[0].isIntersecting) return;
        count.disconnect();
        el.querySelectorAll<HTMLElement>("[data-count]").forEach((n) => {
          const end = +(n.dataset.count ?? 0);
          if (reduce || end === 0) {
            n.textContent = String(end);
            return;
          }
          let t0: number | null = null;
          const fr = (ts: number) => {
            if (!t0) t0 = ts;
            const k = Math.min(1, (ts - t0) / 900);
            n.textContent = String(Math.round(end * (1 - Math.pow(1 - k, 3))));
            if (k < 1) requestAnimationFrame(fr);
          };
          requestAnimationFrame(fr);
        });
      },
      { threshold: 0.4 },
    );
    count.observe(el);

    return () => {
      reveal.disconnect();
      count.disconnect();
    };
  }, []);

  return (
    <div className="stats reveal" id="stats" ref={ref}>
      <div className="stat">
        <div className="n">
          <em data-count="0">0</em>
        </div>
        <div className="l">servers to patch</div>
      </div>
      <div className="stat">
        <div className="n">
          <em data-count="0">0</em>
        </div>
        <div className="l">keys stored</div>
      </div>
      <div className="stat">
        <div className="n" data-count="1">
          0
        </div>
        <div className="l">line to integrate</div>
      </div>
      <div className="stat">
        <div className="n">
          <span data-count="100">0</span>
          <em>%</em>
        </div>
        <div className="l">your code · MIT forever</div>
      </div>
    </div>
  );
}
