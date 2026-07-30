"use client";

import { useEffect, useRef, useState } from "react";
import BrandMark from "./BrandMark";
import WatchReel from "./WatchReel";
import { LINKS } from "./links";

// v3 landing — "the trip is the hero". Faithful port of the design handoff (Breakerbox Landing v3).
// Styles live in app/v3.css (scoped under .v3); the hero live-run logic is the DCLogic class ported
// to hooks. Values, copy, and hop data are the intended production spec. Logo (BrandMark), the reel,
// and every destination (LINKS) are the real site's — same sources as the previous deployment.

const HOPS = [
  { hop: "hop 3", note: "model call", amt: "$0.09", v: 0.09, loop: false },
  { hop: "hop 7", note: "tool call → search", amt: "$0.16", v: 0.16, loop: false },
  { hop: "hop 9", note: "↺ repeat detected (0.91 similarity)", amt: "$0.24", v: 0.24, loop: true },
  { hop: "hop 11", note: "↺ repeat detected (0.94 similarity)", amt: "$0.33", v: 0.33, loop: true },
  { hop: "⏻ stop", note: "loop · next hop never dispatched", amt: "$0.82", v: 0.82, loop: true },
];
const CAP = 0.9;
const dim = (a: number) => `rgba(242,240,233,${a})`;

// Every destination the previous deployment exposed, from the shared LINKS source of truth.
const FOOTER_COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "PROJECT",
    links: [
      { label: "GitHub", href: LINKS.github },
      { label: "PyPI", href: LINKS.pypi },
      { label: "Roadmap", href: LINKS.roadmap },
      { label: "Changelog", href: LINKS.changelog },
    ],
  },
  {
    title: "PRODUCT",
    links: [
      { label: "Docs", href: LINKS.docs },
      { label: "Builder", href: LINKS.builder },
      { label: "Dashboard", href: LINKS.dashboard },
    ],
  },
  {
    title: "COMMUNITY",
    links: [
      { label: "Discussions", href: LINKS.discussions },
      { label: "Issues", href: LINKS.issues },
      { label: "Contact", href: LINKS.email },
      { label: "X / Twitter", href: LINKS.twitter },
      { label: "LinkedIn", href: LINKS.linkedin },
    ],
  },
];

function Eyebrow({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="v3-eyebrow">
      <span className="n">{n}</span>
      {"  "}
      {children}
    </div>
  );
}

// Number that ramps from 0 → `to` once scrolled into view (eased, ~1.5s). Jumps straight
// to the final value under prefers-reduced-motion. Browser rAF/perf.now — client only.
function CountUp({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
  style,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVal(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        let start: number | undefined;
        const tick = (t: number) => {
          start ??= t;
          const p = Math.min(1, (t - start) / 1500);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(p < 1 ? to * eased : to);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [to]);
  const body = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString("en-US");
  return (
    <div ref={ref} className={className} style={style}>
      {prefix}
      {body}
      {suffix}
    </div>
  );
}

export default function LandingV3() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [disp, setDisp] = useState(0);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStep(HOPS.length);
      setDisp(0.82);
      return;
    }
    setStep(0);
    setDisp(0);
    let s = 0;
    let d = 0;
    let stepT: ReturnType<typeof setInterval> | undefined;
    let lerpT: ReturnType<typeof setInterval> | undefined;
    const startT = setTimeout(() => {
      stepT = setInterval(() => {
        s = Math.min(s + 1, HOPS.length);
        setStep(s);
        if (s >= HOPS.length && stepT) clearInterval(stepT);
      }, 700);
      lerpT = setInterval(() => {
        const target = s > 0 ? HOPS[Math.min(s, HOPS.length) - 1].v : 0;
        d = d + (target - d) * 0.16;
        const done = s >= HOPS.length && Math.abs(target - d) < 0.003;
        setDisp(done ? target : d);
        if (done && lerpT) clearInterval(lerpT);
      }, 40);
    }, 700);
    return () => {
      clearTimeout(startT);
      if (stepT) clearInterval(stepT);
      if (lerpT) clearInterval(lerpT);
    };
  }, [runKey]);

  // Scroll-reveal (progressive enhancement). Reveals use the independent `translate`
  // property (see v3.css) so they compose with each element's own transform. Blocks already
  // in view at mount are settled synchronously → no flash. Skipped under reduced motion.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("v3-anim");
    const sel = ".v3-eyebrow, .v3-h2, .v3-lede, .v3-card, .v3-glass, .v3-receipt, blockquote";
    const els = Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => !el.closest("#top"), // hero already enters via bbrise
    );
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -7% 0px" },
    );
    const vh = window.innerHeight;
    els.forEach((el) => {
      el.classList.add("v3-reveal");
      if (el.classList.contains("v3-card") && el.parentElement) {
        const sibs = Array.from(
          el.parentElement.querySelectorAll<HTMLElement>(":scope > .v3-card"),
        );
        const i = sibs.indexOf(el);
        if (i > 0) el.style.transitionDelay = `${i * 70}ms`; // staggered cascade
      }
      if (el.getBoundingClientRect().top < vh * 0.9) el.classList.add("in");
      else io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // Thin brass scroll-progress rail at the very top.
  useEffect(() => {
    const bar = progressRef.current;
    if (!bar) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const copyInstall = () => {
    try {
      navigator.clipboard?.writeText("pip install breakerbox");
    } catch {
      /* clipboard blocked — no-op */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const copyLabel = copied ? "copied ✓" : "pip install breakerbox";
  const done = step >= HOPS.length;
  const spentPct = Math.min(100, Math.round((disp / CAP) * 1000) / 10);
  const tabColor = (i: number) => (tab === i ? "#f2f0e9" : "rgba(242,240,233,0.5)");
  const tabBorder = (i: number) => (tab === i ? "#d4a017" : "transparent");

  return (
    <div className="v3" ref={rootRef}>
      <div className="v3-progress" ref={progressRef} aria-hidden="true" />
      {/* ---- header ---- */}
      <header className="v3-header">
        <div className="v3-wrap v3-header-in">
          <a href={LINKS.home} aria-label="Breakerbox home" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BrandMark width={20} height={29} />
            <span style={{ font: "700 13.5px/1 var(--font-jbmono)", letterSpacing: "0.16em" }}>
              BREAKERBOX
            </span>
          </a>
          <nav className="v3-nav">
            <a href="#mechanism">Mechanism</a>
            <a href="#ceiling">Ceiling</a>
            <a href="#security">Security</a>
            <a href={LINKS.docs}>Docs</a>
            <a href={LINKS.dashboard}>Dashboard</a>
            <a href={LINKS.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <button type="button" className="v3-install" onClick={copyInstall}>
              <span style={{ color: "#d4a017" }}>$</span>
              <span>{copyLabel}</span>
            </button>
          </nav>
        </div>
      </header>

      {/* ---- hero ---- */}
      <section
        id="top"
        style={{
          position: "relative",
          maxWidth: 1280,
          margin: "0 auto",
          padding: "clamp(72px,10vw,140px) clamp(20px,5vw,64px) clamp(56px,7vw,110px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(460px,100%),1fr))",
            gap: "clamp(44px,5vw,84px)",
            alignItems: "center",
          }}
        >
          <div style={{ animation: "bbrise .7s cubic-bezier(.2,.7,.2,1) both" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                border: "1px solid rgba(212,160,23,0.35)",
                background: "rgba(212,160,23,0.07)",
                borderRadius: 99,
                font: "500 11px/1 var(--font-jbmono)",
                letterSpacing: "0.16em",
                color: "#e8bb45",
                marginBottom: "clamp(26px,3vw,40px)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: "#d4a017",
                  borderRadius: "50%",
                  animation: "bbpulse 2.2s ease infinite",
                }}
              />
              OPEN SOURCE · MIT · v0.11.0 ON PYPI
            </div>
            <h1 className="v3-h1">
              Your agents <span className="v3-gt-brass">can&apos;t</span> outspend you.
            </h1>
            <p className="v3-lede" style={{ maxWidth: "50ch", margin: "0 0 40px", fontSize: "clamp(17px,1.6vw,21px)", color: dim(0.64) }}>
              A circuit breaker for AI agents. One wrap around your LangGraph app and the dollar cap
              is enforced <em style={{ color: "#f2f0e9", fontStyle: "normal" }}>inside your process</em>,
              between every hop — not observed on a dashboard after the invoice lands.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
              <button type="button" className="v3-cta" onClick={copyInstall}>
                {copyLabel}
              </button>
              <a className="v3-ghost" href={LINKS.github} target="_blank" rel="noopener noreferrer">
                Read the source →
              </a>
            </div>
            <div style={{ marginBottom: 34 }}>
              <WatchReel />
            </div>
            <div style={{ font: "400 12px/1.9 var(--font-jbmono)", color: dim(0.42), letterSpacing: "0.03em" }}>
              MIT · Python 3.11+ · in-process · no server, no stored keys · 221 tests
            </div>
          </div>

          <div className="v3-term" style={{ animation: "bbrise .7s .12s cubic-bezier(.2,.7,.2,1) both" }}>
            <div aria-hidden="true" className="v3-term-glow" />
            <div className="v3-glass" style={{ boxShadow: "0 60px 120px -50px rgba(0,0,0,0.95)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  padding: "15px clamp(18px,2.2vw,26px)",
                  borderBottom: `1px solid ${dim(0.08)}`,
                  background: "rgba(255,255,255,0.028)",
                }}
              >
                <span style={{ font: "500 11px/1 var(--font-jbmono)", letterSpacing: "0.18em", color: dim(0.45) }}>
                  LIVE RUN · guard(budget_usd=0.90, detect_loops=True)
                </span>
                <button
                  type="button"
                  onClick={() => setRunKey((k) => k + 1)}
                  className="v3-mono"
                  style={{
                    padding: "7px 13px",
                    border: `1px solid ${dim(0.16)}`,
                    background: "transparent",
                    borderRadius: 9,
                    cursor: "pointer",
                    font: "500 11px/1 var(--font-jbmono)",
                    letterSpacing: "0.1em",
                    color: dim(0.7),
                  }}
                >
                  REPLAY
                </button>
              </div>
              <div style={{ padding: "clamp(20px,2.6vw,30px) clamp(18px,2.2vw,28px) clamp(18px,2.2vw,26px)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
                  <div>
                    <div style={{ font: "500 10.5px/1 var(--font-jbmono)", letterSpacing: "0.22em", color: dim(0.4), marginBottom: 10 }}>
                      SPENT THIS RUN
                    </div>
                    <div
                      style={{
                        font: "700 clamp(44px,4.6vw,62px)/1 var(--font-display)",
                        letterSpacing: "-0.03em",
                        fontVariantNumeric: "tabular-nums",
                        color: done ? "#e8bb45" : "#f2f0e9",
                        transition: "color .3s ease",
                      }}
                    >
                      ${disp.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ font: "500 10.5px/1 var(--font-jbmono)", letterSpacing: "0.22em", color: dim(0.4), marginBottom: 10 }}>
                      HARD CAP
                    </div>
                    <div style={{ font: "700 clamp(26px,2.6vw,34px)/1.2 var(--font-display)", letterSpacing: "-0.02em", color: dim(0.8) }}>
                      $0.90
                    </div>
                  </div>
                </div>
                <div className="v3-bar-track">
                  <div className="v3-bar-fill" style={{ width: `${spentPct}%` }} />
                </div>
                {HOPS.map((h, i) => {
                  const shown = i < step;
                  const tone = shown ? (h.loop ? "#e8bb45" : "#f2f0e9") : dim(0.5);
                  return (
                    <div key={h.hop} className="v3-hop" style={{ opacity: shown ? 1 : 0.13 }}>
                      <span style={{ color: tone }}>{h.hop}</span>
                      <span style={{ color: dim(0.45), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.note}
                      </span>
                      <span style={{ textAlign: "right", color: tone, fontVariantNumeric: "tabular-nums" }}>
                        {h.amt}
                      </span>
                    </div>
                  );
                })}
                {done && (
                  <div className="v3-trip">
                    <span style={{ flex: "none", color: "#d4a017" }}>⏻</span>
                    <span>
                      BudgetPaused: tripped at cap · state checkpointed · resume() to continue
                      <span className="v3-caret" />
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 16, font: "400 11.5px/1.7 var(--font-jbmono)", color: dim(0.38) }}>
                  unguarded, this run keeps going: <span style={{ color: dim(0.6) }}>$12.63</span> · tripped at{" "}
                  <span style={{ color: "#e8bb45" }}>$0.82</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- 01 failure + receipt ---- */}
      <div className="v3-band">
        <section className="v3-section">
          <div aria-hidden="true" className="v3-wm">01</div>
          <div className="v3-two">
            <div>
              <Eyebrow n="01">THE FAILURE MODE IS FINANCIAL</Eyebrow>
              <h2 className="v3-h2">
                You find out
                <br />
                from the invoice.
              </h2>
              <p className="v3-lede" style={{ maxWidth: "48ch", margin: "0 0 44px" }}>
                Agents call models in loops. A retry loop. A &quot;let me try one more approach.&quot;
                An infinite tool loop. Nothing crashes — the run looks healthy right up until
                accounting reads it back to you.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(32px,4.6vw,64px)", paddingTop: 36, borderTop: `1px solid ${dim(0.1)}` }}>
                {[
                  { to: 47000, prefix: "$", decimals: 0, label: "IN 11 DAYS" },
                  { to: 1.67, suffix: "B", decimals: 2, label: "TOKENS IN 5 HOURS" },
                ].map((s) => (
                  <div key={s.label}>
                    <CountUp
                      to={s.to}
                      prefix={s.prefix}
                      suffix={s.suffix}
                      decimals={s.decimals}
                      className="v3-gt-stat"
                      style={{ font: "700 clamp(44px,5.4vw,76px)/1 var(--font-display)", letterSpacing: "-0.04em" }}
                    />
                    <div style={{ font: "400 12px/1.5 var(--font-jbmono)", letterSpacing: "0.08em", color: dim(0.45), marginTop: 12 }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", padding: "clamp(10px,2vw,30px) 0" }}>
              <div style={{ position: "relative", width: "min(400px,100%)" }}>
                <div aria-hidden="true" className="v3-receipt-glow" />
                <div className="v3-receipt">
                  <div className="v3-paper">
                    <div style={{ textAlign: "center", borderBottom: "1px dashed rgba(20,22,26,0.32)", paddingBottom: 17, marginBottom: 19 }}>
                      <div style={{ font: "700 13px/1 var(--font-jbmono)", letterSpacing: "0.26em" }}>BREAKERBOX</div>
                      <div style={{ font: "400 10px/1.7 var(--font-jbmono)", letterSpacing: "0.12em", color: "rgba(20,22,26,0.55)", marginTop: 10 }}>
                        COUNTERFACTUAL RECEIPT
                        <br />
                        WHAT THIS RUN WOULD HAVE COST
                      </div>
                    </div>
                    <div style={{ font: "400 clamp(11.5px,1.1vw,13px)/1 var(--font-jbmono)", display: "flex", flexDirection: "column", gap: 13 }}>
                      {[
                        ["input tokens", "$0.84"],
                        ["output tokens", "$1.23"],
                        ["retry loop ×47", "$38.90"],
                        ["self-reflection ×12", "$54.20"],
                        ['"one more approach"', "$92.11"],
                        ["infinite tool loop", "$198.42"],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <span>{k}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: "1px dashed rgba(20,22,26,0.32)", marginTop: 19, paddingTop: 17, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                      <span style={{ font: "700 12px/1 var(--font-jbmono)", letterSpacing: "0.16em" }}>TOTAL</span>
                      <span style={{ font: "700 clamp(24px,2.6vw,32px)/1 var(--font-display)", letterSpacing: "-0.02em" }}>$385.70</span>
                    </div>
                    <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
                      <div style={{ transform: "rotate(-7deg)", border: "3px solid #b8433a", color: "#b8433a", borderRadius: 9, padding: "10px 18px", font: "700 clamp(13px,1.4vw,16px)/1 var(--font-jbmono)", letterSpacing: "0.12em", opacity: 0.9 }}>
                        TRIPPED AT $5.00
                      </div>
                    </div>
                    <div style={{ textAlign: "center", marginTop: 28, font: "400 9.5px/1.7 var(--font-jbmono)", letterSpacing: "0.12em", color: "rgba(20,22,26,0.5)" }}>
                      EVERY RUN ENDS IN A RECEIPT
                      <br />
                      PER-HOP COSTS · TRIP REASON · BLAST RADIUS
                    </div>
                  </div>
                  <div className="v3-torn" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---- 02 wrong shape + pull quote ---- */}
      <section className="v3-section">
        <div aria-hidden="true" className="v3-wm">02</div>
        <Eyebrow n="02">EVERYTHING ELSE IS THE WRONG SHAPE</Eyebrow>
        <h2 className="v3-h2" style={{ maxWidth: "19ch", marginBottom: "clamp(48px,5vw,76px)" }}>
          Three tools you already have. None of them stop this.
        </h2>
        <div className="v3-cards">
          {[
            ["Provider rate limits", <>Org-wide and coarse. A runaway run burns $180 while still under a $500 key ceiling — and when the key finally trips, it 429s <em style={{ fontStyle: "normal", color: "#f2f0e9" }}>everyone</em>, mid-flight.</>, "WRONG GRANULARITY"],
            ["Dashboards", <>They show cost after it happened, beautifully. Observation, not enforcement. A smoke detector is not a sprinkler.</>, "WRONG TENSE"],
            ["Gateways & proxies", <>Outside the process, blind to internal structure — sub-agents, loops, checkpoints. And they hold your keys.</>, "WRONG SIDE OF THE WALL"],
          ].map(([title, body, verdict], i) => (
            <div key={i} className="v3-card">
              <div className="v3-card-title">{title}</div>
              <p className="v3-card-p">{body}</p>
              <div className="v3-verdict">{verdict}</div>
            </div>
          ))}
        </div>
        <blockquote style={{ margin: "clamp(64px,8vw,110px) auto 0", padding: 0, textAlign: "center" }}>
          <p style={{ margin: "0 auto", maxWidth: "26ch", font: "500 clamp(28px,4.2vw,54px)/1.18 var(--font-display)", letterSpacing: "-0.03em", textWrap: "balance" }}>
            A key limit is the fuse box for the building.{" "}
            <span style={{ background: "linear-gradient(115deg,#f6d67c,#c8950f)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              Breakerbox is the breaker on this circuit.
            </span>
          </p>
        </blockquote>
      </section>

      {/* ---- 03 mechanism ---- */}
      <div id="mechanism" className="v3-band">
        <section className="v3-section">
          <div aria-hidden="true" className="v3-wm">03</div>
          <Eyebrow n="03">THE MECHANISM</Eyebrow>
          <h2 className="v3-h2" style={{ maxWidth: "20ch", marginBottom: 24 }}>
            A credit-card hold, on every hop.
          </h2>
          <p className="v3-lede" style={{ maxWidth: "60ch", margin: "0 0 clamp(48px,5vw,76px)" }}>
            One callback handler propagates down the entire run tree — nodes, sub-agents, subgraphs.
            One wrap meters everything. No LLM in the hot path. Deterministic. In-process.
          </p>
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: "clamp(14px,1.6vw,20px)" }}>
            <div aria-hidden="true" style={{ position: "absolute", top: "50%", left: "4%", right: "4%", height: 1, background: "linear-gradient(90deg,transparent,rgba(212,160,23,0.35),transparent)", pointerEvents: "none" }} />
            {[
              ["1", "RESERVE", "Before each call, hold the maximum possible cost against the budget. Parallel branches cannot race past the ceiling."],
              ["2", "EXECUTE", "Run the call to completion — never severed mid-flight. You never pay for a half-finished token stream."],
              ["3", "RECONCILE", "Settle the hold against actual usage. Enforcement lands at the hop boundary — the next step simply never dispatches."],
            ].map(([n, label, body]) => (
              <div key={label} className="v3-card" style={{ position: "relative", background: "linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.014)) padding-box,linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.02)) border-box" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                  <span className="v3-step-badge">{n}</span>
                  <span style={{ font: "500 12px/1 var(--font-jbmono)", letterSpacing: "0.22em", color: "#e8bb45" }}>{label}</span>
                </div>
                <p style={{ margin: 0, font: "400 15px/1.62 var(--font-sans)", color: dim(0.6) }}>{body}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: "clamp(22px,2.8vw,44px)", marginTop: "clamp(40px,4.6vw,64px)" }}>
            {[
              ["Hierarchical escrow", <>Parent holds $5.00; sub-agents draw slices they cannot exceed. <code style={{ font: "400 13px/1.6 var(--font-jbmono)", color: "#e8bb45" }}>sub_budgets={'{"researcher": 2.00}'}</code></>],
              ["Semantic loop detection", <>Fuzzy repeat matching, no LLM. Trips a spinning loop <em style={{ fontStyle: "normal", color: "#f2f0e9" }}>before</em> the budget pays for it.</>],
              ["Pause, don't restart", <><code style={{ font: "400 13px/1.6 var(--font-jbmono)", color: "#e8bb45" }}>on_trip=&quot;pause&quot;</code> checkpoints state so you resume. <code style={{ font: "400 13px/1.6 var(--font-jbmono)", color: "#e8bb45" }}>kill</code> lists every side effect that already fired.</>],
            ].map(([title, body], i) => (
              <div key={i} style={{ borderLeft: "2px solid rgba(212,160,23,0.45)", paddingLeft: 22 }}>
                <div style={{ font: "600 15px/1.4 var(--font-sans)", color: "#f2f0e9", marginBottom: 9 }}>{title}</div>
                <p style={{ margin: 0, font: "400 14.5px/1.62 var(--font-sans)", color: dim(0.55) }}>{body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---- 04 ceiling ---- */}
      <section id="ceiling" className="v3-section">
        <div aria-hidden="true" className="v3-wm">04</div>
        <Eyebrow n="04">PROVABLE COST CEILING · FLAGSHIP</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(420px,100%),1fr))", gap: "clamp(44px,5vw,80px)", alignItems: "start" }}>
          <div>
            <h2 className="v3-h2" style={{ maxWidth: "16ch", marginBottom: 24 }}>
              Prove the number before you spend it.
            </h2>
            <p className="v3-lede" style={{ maxWidth: "46ch", margin: "0 0 28px" }}>
              A static, worst-case dollar ceiling computed from the spec — before the run, with zero
              API calls. DAGs sum their worst cases. Capped loops multiply hops by the costliest call.
            </p>
            <p className="v3-lede" style={{ maxWidth: "46ch", margin: 0 }}>
              And when a loop has no cap, it prints{" "}
              <span style={{ color: "#e8bb45", fontFamily: "var(--font-jbmono)", fontSize: "0.88em", letterSpacing: "0.05em" }}>UNBOUNDED</span>{" "}
              instead of inventing a number. An estimate you can&apos;t trust at the tail is worse than
              no estimate.
            </p>
          </div>
          <div className="v3-glass">
            <div style={{ display: "flex", borderBottom: `1px solid ${dim(0.08)}`, background: "rgba(255,255,255,0.028)", overflowX: "auto" }}>
              {["DAG", "LOOP · CAPPED", "LOOP · UNCAPPED"].map((label, i) => (
                <button key={label} type="button" className="v3-tab" onClick={() => setTab(i)} style={{ borderBottom: `2px solid ${tabBorder(i)}`, color: tabColor(i) }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ padding: "clamp(22px,2.6vw,32px)", minHeight: 300 }}>
              <pre style={{ margin: 0, font: "400 clamp(11.5px,1.05vw,13px)/1.9 var(--font-jbmono)", color: dim(0.66), overflowX: "auto" }}>
                <span style={{ color: dim(0.4) }}>$</span> <span style={{ color: "#f2f0e9" }}>breakerbox ceiling spec.json</span>
                {"\n\n  method   static analysis · 0 API calls\n"}
                {tab === 0 && (
                  <>
                    {"  rule     DAG → Σ worst-case(node)\n\n  plan → research → draft → review\n  4 nodes · 0 unbounded\n\n"}
                    <span style={{ color: "#e8bb45" }}>{"  ┌──────────────────────────────┐\n  │  CEILING              $2.09  │\n  └──────────────────────────────┘"}</span>
                    {"\n  "}
                    <span style={{ color: dim(0.45) }}>this file cannot cost more than $2.09</span>
                  </>
                )}
                {tab === 1 && (
                  <>
                    {"  rule     loop(max_hops) → hops × worst-case(call)\n\n  loop:react   max_hops=12   worst call $0.1742\n  12 × $0.1742\n\n"}
                    <span style={{ color: "#e8bb45" }}>{"  ┌──────────────────────────────┐\n  │  CEILING              $2.09  │\n  └──────────────────────────────┘"}</span>
                    {"\n  "}
                    <span style={{ color: dim(0.45) }}>pin it: breakerbox lock --check</span>
                  </>
                )}
                {tab === 2 && (
                  <>
                    {"  rule     loop without max_hops → no finite bound\n\n  loop:react   max_hops="}
                    <span style={{ color: "#c96157" }}>None</span>
                    {"\n\n"}
                    <span style={{ color: "#c96157" }}>{"  ┌──────────────────────────────┐\n  │  CEILING         UNBOUNDED   │\n  └──────────────────────────────┘"}</span>
                    {"\n  "}
                    <span style={{ color: dim(0.45) }}>no number invented. cap the loop.</span>
                  </>
                )}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ---- 05 security ---- */}
      <div id="security" className="v3-band">
        <section className="v3-section">
          <div aria-hidden="true" className="v3-wm">05</div>
          <Eyebrow n="05">SECURITY SUITE · NEW IN 0.11.0</Eyebrow>
          <h2 className="v3-h2" style={{ maxWidth: "22ch", marginBottom: 24 }}>
            The meter that counts dollars sees every tool call.
          </h2>
          <p className="v3-lede" style={{ maxWidth: "60ch", margin: "0 0 clamp(48px,5vw,76px)" }}>
            Prompt-level red-teamers grade text. Breakerbox asserts properties at the tool-call level,
            at runtime. Four commands, one finding format, composable into CI.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: "clamp(14px,1.6vw,20px)" }}>
            {[
              ["breakerbox dow", "Denial-of-wallet", "Names the uncapped loop as the attack surface and prices the worst case per invocation."],
              ["breakerbox flow", "Embedded credentials", "Scans exported Langflow flows for the CVE-2026-55255 class, plus untrusted→action paths with no approval gate."],
              ["breakerbox mcp", "MCP server posture", "Hardcoded secrets, unpinned npx @latest supply chain, non-TLS remotes."],
              ["breakerbox baseline", "Regression gate", "Accept today's findings once; CI then fails only on new ones."],
            ].map(([cmd, title, body]) => (
              <div key={cmd} className="v3-card" style={{ padding: "clamp(26px,2.8vw,34px)" }}>
                <div style={{ font: "600 clamp(14px,1.3vw,16px)/1 var(--font-jbmono)", color: "#e8bb45", marginBottom: 16 }}>{cmd}</div>
                <div style={{ font: "600 14px/1.4 var(--font-sans)", color: "#f2f0e9", marginBottom: 9 }}>{title}</div>
                <p style={{ margin: 0, font: "400 14.5px/1.6 var(--font-sans)", color: dim(0.55) }}>{body}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "clamp(28px,3vw,40px)", border: "1px solid rgba(212,160,23,0.24)", background: "linear-gradient(180deg,rgba(212,160,23,0.11),rgba(212,160,23,0.03))", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderRadius: 20, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", padding: "clamp(24px,2.8vw,36px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: "clamp(16px,2.4vw,36px)", alignItems: "center" }}>
            <code style={{ font: "600 clamp(13px,1.25vw,16px)/1.75 var(--font-jbmono)", color: "#e8bb45", wordBreak: "break-word" }}>
              guard(capability_lock=True)
              <br />
              mark_untrusted(tool)
            </code>
            <p style={{ margin: 0, font: "400 15.5px/1.62 var(--font-sans)", color: dim(0.7) }}>
              After untrusted content enters the run, side-effecting tools are blocked{" "}
              <em style={{ fontStyle: "normal", color: "#f2f0e9" }}>before they execute</em> — not flagged afterwards.
            </p>
          </div>
        </section>
      </div>

      {/* ---- 06 the whole surface ---- */}
      <section className="v3-section">
        <div aria-hidden="true" className="v3-wm">06</div>
        <Eyebrow n="06">THE WHOLE SURFACE AREA</Eyebrow>
        <h2 className="v3-h2" style={{ maxWidth: "20ch", marginBottom: "clamp(44px,5vw,64px)" }}>
          One function. Eight ways to trip.
        </h2>
        <div className="v3-glass">
          <pre style={{ margin: 0, padding: "clamp(24px,2.8vw,38px)", font: "400 clamp(12px,1.1vw,14px)/2.1 var(--font-jbmono)", color: dim(0.72), overflowX: "auto" }}>
            {"app = "}
            <span style={{ color: "#e8bb45" }}>guard</span>
            {"(\n    compiled,\n    budget_usd="}
            <span style={{ color: "#8fb8a8" }}>5.00</span>
            {",            "}
            <span style={{ color: dim(0.34) }}># hard dollar ceiling</span>
            {'\n    sub_budgets={"researcher": '}
            <span style={{ color: "#8fb8a8" }}>2.00</span>
            {"},   "}
            <span style={{ color: dim(0.34) }}># hierarchical escrow</span>
            {"\n    max_hops="}
            <span style={{ color: "#8fb8a8" }}>40</span>
            {", max_depth="}
            <span style={{ color: "#8fb8a8" }}>3</span>
            {", ttl_seconds="}
            <span style={{ color: "#8fb8a8" }}>900</span>
            {",\n    velocity_usd_per_min="}
            <span style={{ color: "#8fb8a8" }}>0.50</span>
            {",   "}
            <span style={{ color: dim(0.34) }}># burn-rate rail</span>
            {"\n    detect_loops="}
            <span style={{ color: "#8fb8a8" }}>True</span>
            {",           "}
            <span style={{ color: dim(0.34) }}># semantic, no LLM</span>
            {"\n    capability_lock="}
            <span style={{ color: "#8fb8a8" }}>True</span>
            {",        "}
            <span style={{ color: dim(0.34) }}># block side effects post-untrusted</span>
            {"\n    on_trip="}
            <span style={{ color: "#8fb8a8" }}>&quot;pause&quot;</span>
            {",             "}
            <span style={{ color: dim(0.34) }}># or &quot;kill&quot;</span>
            {"\n    live="}
            <span style={{ color: "#8fb8a8" }}>True</span>
            {", alerts=..., tags=..., otel="}
            <span style={{ color: "#8fb8a8" }}>True</span>
            {",\n)"}
          </pre>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: "clamp(28px,3vw,40px)", alignItems: "center" }}>
          <span style={{ font: "500 11px/1 var(--font-jbmono)", letterSpacing: "0.2em", color: dim(0.4), marginRight: 8 }}>TRIP REASONS</span>
          {["budget", "hops", "ttl", "velocity", "loop", "depth", "remote", "capability"].map((t) => (
            <span key={t} className="v3-pill">{t}</span>
          ))}
        </div>
      </section>

      {/* ---- 07/08 CI + cloud ---- */}
      <div className="v3-band">
        <section className="v3-section">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(360px,100%),1fr))", gap: "clamp(44px,5vw,84px)" }}>
            <div>
              <Eyebrow n="07">CI &amp; FINOPS</Eyebrow>
              <h2 style={{ font: "500 clamp(28px,3.2vw,38px)/1.1 var(--font-display)", letterSpacing: "-0.028em", margin: "0 0 32px", maxWidth: "18ch" }}>
                The budget becomes a build artifact.
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 17, font: "400 15px/1.6 var(--font-sans)", color: dim(0.58) }}>
                {[
                  ["lock --check", "Pin prices and ceilings; fail the build on drift."],
                  ["diff --fail-on-increase", "Budget delta between commits, as a sticky PR comment."],
                  ["breakerbox.yaml", "Policy-as-code: the build refuses to emit violating code."],
                  ["tags · otel", "Per-team cost attribution and OpenTelemetry spans."],
                ].map(([code, body]) => (
                  <div key={code} style={{ display: "grid", gridTemplateColumns: "minmax(0,auto) 1fr", gap: 15, alignItems: "baseline" }}>
                    <code style={{ font: "600 13px/1.5 var(--font-jbmono)", color: "#e8bb45", whiteSpace: "nowrap" }}>{code}</code>
                    <span>{body}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Eyebrow n="08">OPTIONAL CLOUD</Eyebrow>
              <h2 style={{ font: "500 clamp(28px,3.2vw,38px)/1.1 var(--font-display)", letterSpacing: "-0.028em", margin: "0 0 32px", maxWidth: "18ch" }}>
                A builder that only writes code.
              </h2>
              <p style={{ margin: "0 0 24px", font: "400 15px/1.65 var(--font-sans)", color: dim(0.58), maxWidth: "44ch", textWrap: "pretty" }}>
                A React Flow canvas that emits plain guarded Python. Codegen only — nothing executes
                server-side, keys never leave the browser. Live run timeline, remote pause/kill with
                per-run control keys, shareable receipt links.
              </p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 15px", border: `1px solid ${dim(0.14)}`, background: "rgba(255,255,255,0.03)", borderRadius: 99, font: "500 11.5px/1 var(--font-jbmono)", letterSpacing: "0.08em", color: dim(0.62) }}>
                <span style={{ width: 6, height: 6, background: "#8fb8a8", borderRadius: "50%" }} />
                THE CORE STAYS LOCAL AND OFFLINE
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---- closing ---- */}
      <section style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "clamp(90px,12vw,170px) clamp(20px,5vw,64px) clamp(60px,8vw,110px)", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 34 }}>
          <span style={{ display: "grid", placeItems: "center", filter: "drop-shadow(0 14px 34px rgba(212,160,23,0.5))" }}>
            <BrandMark width={46} height={68} />
          </span>
        </div>
        <h2 style={{ font: "700 clamp(44px,6.6vw,96px)/0.98 var(--font-display)", letterSpacing: "-0.045em", margin: "0 auto 26px", maxWidth: "14ch", textWrap: "balance" }}>
          Four lines to a hard cap.
        </h2>
        <p className="v3-lede" style={{ maxWidth: "44ch", margin: "0 auto 42px" }}>
          No server. No stored keys. No LLM in the hot path. Add it to one run and the ceiling is real
          from the next hop onward.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginBottom: 52 }}>
          <button type="button" className="v3-cta" style={{ padding: "18px 30px", borderRadius: 15, fontSize: "15.5px" }} onClick={copyInstall}>
            {copyLabel}
          </button>
          <a className="v3-ghost" href={LINKS.github} target="_blank" rel="noopener noreferrer" style={{ padding: "18px 30px", borderRadius: 15 }}>
            Star on GitHub
          </a>
        </div>
        <div style={{ display: "inline-block", textAlign: "left", borderRadius: 20 }} className="v3-card">
          <pre style={{ margin: 0, font: "400 clamp(12px,1.1vw,14px)/2.15 var(--font-jbmono)", color: dim(0.72), overflowX: "auto" }}>
            <span style={{ color: dim(0.4) }}>$</span> pip install breakerbox
            {"\n"}
            <span style={{ color: "#e8bb45" }}>from</span> breakerbox <span style={{ color: "#e8bb45" }}>import</span> guard
            {"\napp = guard(compiled, budget_usd="}
            <span style={{ color: "#8fb8a8" }}>5.00</span>
            {", on_trip="}
            <span style={{ color: "#8fb8a8" }}>&quot;pause&quot;</span>
            {")\napp.invoke(state)"}
          </pre>
        </div>
      </section>

      {/* ---- footer ---- */}
      <footer style={{ borderTop: `1px solid ${dim(0.07)}`, overflow: "hidden" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "clamp(48px,6vw,76px) clamp(20px,5vw,64px) 0",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(180px,100%),1fr))",
            gap: "clamp(32px,4vw,56px)",
          }}
        >
          <div style={{ minWidth: 200 }}>
            <a href={LINKS.home} aria-label="Breakerbox home" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <BrandMark width={20} height={29} />
              <span style={{ font: "700 13.5px/1 var(--font-jbmono)", letterSpacing: "0.16em" }}>BREAKERBOX</span>
            </a>
            <p style={{ margin: 0, font: "400 14px/1.6 var(--font-sans)", color: dim(0.5), maxWidth: "30ch" }}>
              The circuit breaker for AI agents. Built in the open.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <div style={{ font: "500 11px/1 var(--font-jbmono)", letterSpacing: "0.2em", color: dim(0.4), marginBottom: 16 }}>
                {col.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {col.links.map((l) => {
                  const ext = l.href.startsWith("http");
                  return (
                    <a
                      key={l.label}
                      className="v3-footlink"
                      href={l.href}
                      style={{ font: "500 13.5px/1 var(--font-sans)" }}
                      {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {l.label}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "clamp(32px,4vw,48px) clamp(20px,5vw,64px) 0",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
            font: "400 12px/1.7 var(--font-jbmono)",
            color: dim(0.38),
          }}
        >
          <span>
            © 2026 Breakerbox · MIT license · <a className="v3-footlink" href={LINKS.privacy}>Privacy</a>
          </span>
          <span>no server · no stored keys · no run button · 221 tests</span>
        </div>
        <div aria-hidden="true" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)", font: "700 clamp(84px,15.5vw,236px)/0.78 var(--font-display)", letterSpacing: "-0.05em", color: dim(0.045), userSelect: "none", transform: "translateY(0.16em)", whiteSpace: "nowrap" }}>
          BREAKERBOX
        </div>
      </footer>
    </div>
  );
}
