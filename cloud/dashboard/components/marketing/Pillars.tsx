"use client";

import { type PointerEvent, type ReactNode } from "react";
import Reveal, { useReveal } from "./Reveal";

// Each pillar reveals on scroll and has the brass cursor-spotlight (pointermove -> --mx/--my).
function Pillar({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const ref = useReveal();
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} className="pillar reveal" onPointerMove={onMove}>
      <div className="ic">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function Pillars() {
  return (
    <section id="pillars">
      <div className="wrap">
        <Reveal>
          <span className="eyebrow">Budget-first by design</span>
          <h2>
            The only builder where money
            <br />
            is on the canvas.
          </h2>
          <p className="lede">
            Other tools show you cost after the run. In Breakerbox, budget is part of the graph
            itself — allocated while you design, enforced while you run.
          </p>
        </Reveal>
        <div className="pillars">
          <Pillar
            title="Hierarchical escrow"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4a017" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 3v4M12 7l-6 4M12 7l6 4M6 11v6M18 11v6" strokeLinecap="round" />
                <circle cx="12" cy="4" r="1.6" />
                <circle cx="6" cy="18" r="1.6" />
                <circle cx="18" cy="18" r="1.6" />
              </svg>
            }
          >
            A parent workflow holds <code>$5.00</code>. Sub-agents draw from it; a child can never
            exceed its slice. Reserve before dispatch, reconcile after — like a card hold. Parallel
            branches can&apos;t race past the ceiling.
          </Pillar>
          <Pillar
            title="Stops that don't corrupt"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4a017" strokeWidth="1.8" aria-hidden="true">
                <rect x="7" y="3" width="10" height="18" rx="2.5" />
                <path d="M10 8h4M10 12h4" strokeLinecap="round" />
                <path d="M10 16.5l4-1.2" strokeLinecap="round" />
              </svg>
            }
          >
            Enforcement happens between steps, never mid-call. <code>pause</code> checkpoints state so
            you resume, not restart. <code>kill</code> lists every side effect that already fired — so
            you compensate, not guess.
          </Pillar>
          <Pillar
            title="Code you own"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4a017" strokeWidth="1.8" aria-hidden="true">
                <path d="M8 6l-5 6 5 6M16 6l5 6-5 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          >
            The visual builder generates readable Python wrapped in the guard — <code>codegen only</code>.
            Scaffolding you outgrow, not a platform you live in. Edit every line.
          </Pillar>
        </div>
      </div>
    </section>
  );
}
