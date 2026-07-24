import Reveal from "./Reveal";

// [text, className] per cell, in column order: gateways · flow platforms · breakerbox.
const ROWS: { label: string; cells: [string, string][] }[] = [
  { label: "Per-key / org dollar budgets", cells: [["✓", "y"], ["—", "n"], ["— use your gateway", "n"]] },
  { label: "Hierarchical per-agent escrow", cells: [["flat session", "n"], ["—", "n"], ["✓", "yb"]] },
  { label: "Stop at hop boundary, resume from checkpoint", cells: [["429 mid-flight", "n"], ["—", "n"], ["✓", "yb"]] },
  { label: "Catches a runaway run under the org ceiling", cells: [["never fires", "n"], ["—", "n"], ["✓", "yb"]] },
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
            Run both. A gateway like <b>LiteLLM</b> caps org-wide key spend; a builder like{" "}
            <b>Langflow</b> is great for prototyping. Neither governs the dollar-budget or internal
            structure of a single multi-agent run — that&rsquo;s the gap Breakerbox fills: it guards
            the <b>workflow</b> and runs nothing.
          </p>
        </Reveal>
        <Reveal className="cmp">
          <div className="cmpr hd">
            <div />
            <div>Gateways · LiteLLM</div>
            <div>Builders · Langflow</div>
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
        <Reveal className="cmp-catch">
          <div className="cmp-catch-k">The catch most gateway users miss</div>
          <p>
            A key limit has to sit high enough not to block real work — so a single runaway run can
            burn <b>$180 while still under a $500 ceiling</b>. The key never fires until the damage
            is already account-wide, and then it 429s <i>everyone</i>. Breakerbox trips that one run
            at <b>$2</b>, at a hop boundary, before the org ceiling ever notices.
          </p>
          <p className="cmp-catch-line">
            A key limit is the fuse box for the building. Breakerbox is the breaker on this circuit.
          </p>
        </Reveal>
        <p className="cmpnote">
          Facts as of launch — see the README comparison for sources and specifics.
        </p>
      </div>
    </section>
  );
}
