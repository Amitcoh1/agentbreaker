"use client";

import { useEffect, useLayoutEffect, useState } from "react";

export type TourStep = { selector: string; title: string; body: string };

// A tiny no-dependency spotlight tour. The dimmer is one big box-shadow spread on a highlight
// box positioned over the target — no library needed. Auto-runs once per browser (storageKey),
// and replays when a `ab-tour-start` window event fires (the "?" button dispatches it).
export default function Tour({ steps, storageKey }: { steps: TourStep[]; storageKey: string }) {
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(storageKey)) setI(0);
  }, [storageKey]);

  useEffect(() => {
    const start = () => setI(0);
    window.addEventListener("ab-tour-start", start);
    return () => window.removeEventListener("ab-tour-start", start);
  }, []);

  useLayoutEffect(() => {
    if (i == null) return;
    const el = document.querySelector(steps[i].selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [i, steps]);

  if (i == null) return null;
  const step = steps[i];
  const finish = () => {
    localStorage.setItem(storageKey, "1");
    setI(null);
  };
  const next = () => (i + 1 < steps.length ? setI(i + 1) : finish());
  const prev = () => setI(Math.max(0, i - 1));

  // Tooltip: below the target if there's room, else above; clamped to the viewport.
  const w = 320;
  const tipTop = rect
    ? rect.bottom + 190 < window.innerHeight
      ? rect.bottom + 10
      : Math.max(10, rect.top - 180)
    : 90;
  const tipLeft = rect ? Math.min(Math.max(10, rect.left), window.innerWidth - w - 10) : 90;

  return (
    <div className="fixed inset-0 z-50">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-all"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(31,35,40,0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(31,35,40,0.55)" }} />
      )}
      <div
        className="absolute rounded-xl border border-border bg-card p-4 shadow-glow"
        style={{ top: tipTop, left: tipLeft, width: w }}
      >
        <div className="text-sm font-semibold">{step.title}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={finish} className="text-xs text-muted hover:text-fg">
            Skip
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">
              {i + 1}/{steps.length}
            </span>
            {i > 0 && (
              <button onClick={prev} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-ink/5">
                Back
              </button>
            )}
            <button onClick={next} className="rounded-lg bg-fg px-2.5 py-1 text-xs font-medium text-bg">
              {i + 1 < steps.length ? "Next" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
