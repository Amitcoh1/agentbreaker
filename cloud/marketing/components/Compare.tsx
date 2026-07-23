import Reveal from "./Reveal";

// [text, className] per cell, in column order: gateways · flow platforms · breakerbox.
const ROWS: { label: string; cells: [string, string][] }[] = [
  { label: "Per-key / org dollar budgets", cells: [["✓", "y"], ["—", "n"], ["— use your gateway", "n"]] },
  { label: "Hierarchical per-agent escrow", cells: [["flat session", "n"], ["—", "n"], ["✓", "yb"]] },
  { label: "Stop at hop boundary, resume from checkpoint", cells: [["429 mid-flight", "n"], ["—", "n"], ["✓", "yb"]] },
  { label: "Visual builder output", cells: [["n/a", "n"], ["hosted flows", "n"], ["plain Python", "yb"]] },
  { label: "Executes your code server-side", cells: [["n/a", "n"], ["yes", "y"], ["never", "yb"]] },
  { label: "Stores your provider keys", cells: [["yes (proxy)", "y"], ["yes", "y"], ["never", "yb"]] },
];

export default function Compare() {
  return (
    <section id="compare">
      <div className="wrap">
        <Reveal>
          <span className="eyebrow">Complements, not competitors</span>
          <h2>
            Your gateway caps the org.
            <br />
            Breakerbox governs the workflow.
          </h2>
          <p className="lede">
            Run both. Gateways are great at organization-level limits; nothing else governs the
            internal structure of a single multi-agent run.
          </p>
        </Reveal>
        <Reveal className="cmp">
          <div className="cmpr hd">
            <div />
            <div>gateways</div>
            <div>flow platforms</div>
            <div className="me">breakerbox</div>
          </div>
          {ROWS.map((r) => (
            <div className="cmpr" key={r.label}>
              <div className="lbl">{r.label}</div>
              {r.cells.map(([text, cls], i) => (
                <div className={cls} key={i}>
                  {text}
                </div>
              ))}
            </div>
          ))}
        </Reveal>
        <p className="cmpnote">
          Facts as of launch — see the README comparison for sources and specifics.
        </p>
      </div>
    </section>
  );
}
