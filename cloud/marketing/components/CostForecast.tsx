"use client";

import Reveal from "./Reveal";

// A styled, static mock of the builder's cost-forecast panel (band + what-if slider + per-node
// badges + model swap). Built from the site's CSS tokens via inline styles so it needs no edit to
// the verbatim-port marketing.css and no screen recording.
const mono = { fontFamily: '"JetBrains Mono", ui-monospace, monospace' } as const;
const cap = { ...mono, fontSize: 12, color: "var(--tx3)", display: "flex", justifyContent: "space-between" } as const;
const nodeRow = {
  ...mono,
  fontSize: 12.5,
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 12px",
  border: "1px solid var(--line2)",
  borderRadius: 10,
} as const;
const col = { flex: "1 1 360px", minWidth: 300 } as const;

export default function CostForecast() {
  return (
    <section id="forecast">
      <div className="wrap">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 48, alignItems: "center" }}>
          <div style={col}>
            <Reveal>
              <span className="eyebrow">Design-time cost forecast</span>
              <h2>
                Know the cost
                <br />
                before the first token.
              </h2>
              <p className="lede">
                Every other visual builder shows you cost <em>after</em> a run, on their key.
                Breakerbox forecasts it on the canvas — a p50–p95 band per node and across the whole
                graph, before a single token is spent. Drag the loop count or swap a model and the
                number moves live.
              </p>
              <p style={{ marginTop: 14, fontSize: 13, color: "var(--tx3)" }}>
                An estimate, not a quote — calibrated by your own run receipts.
              </p>
            </Reveal>
          </div>

          <div style={col}>
            <Reveal>
              <div style={{ background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 16, padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: "var(--tx3)" }}>Forecast · est.</span>
                  <span style={{ ...mono, fontSize: 22, fontWeight: 600 }}>$0.82–$3.14</span>
                </div>
                <div style={{ position: "relative", height: 10, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: "26%", width: "74%", height: "100%", background: "var(--brass)", opacity: 0.8 }} />
                  <div style={{ position: "absolute", top: 0, left: 0, width: "26%", height: "100%", background: "var(--tx3)" }} />
                </div>
                <div style={{ ...cap, marginTop: 8 }}>
                  <span>budget $5.00</span>
                  <span>p50 → p95</span>
                </div>

                <div style={{ marginTop: 18 }}>
                  <div style={cap}>
                    <span>loops ≈ 3×</span>
                    <span>drag to simulate</span>
                  </div>
                  <div style={{ position: "relative", height: 4, borderRadius: 2, background: "var(--line2)", marginTop: 10 }}>
                    <div style={{ position: "absolute", top: -5, left: "22%", width: 14, height: 14, borderRadius: "50%", background: "var(--brass)" }} />
                  </div>
                </div>

                <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={nodeRow}>
                    <span>planner</span>
                    <span style={{ color: "var(--tx3)" }}>run ≈ $0.06–$0.10</span>
                  </div>
                  <div style={nodeRow}>
                    <span style={{ color: "var(--brass)" }}>↻ writer</span>
                    <span style={{ color: "var(--brass)" }}>run ≈ $0.21–$1.68</span>
                  </div>
                </div>

                <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--tx3)" }}>
                  try <b style={{ color: "var(--brass)", fontWeight: 500 }}>Haiku</b> on writer →{" "}
                  <b style={{ color: "var(--brass)", fontWeight: 500 }}>−67%</b> on this branch
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
