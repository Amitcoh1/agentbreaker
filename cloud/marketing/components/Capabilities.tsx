import Reveal from "./Reveal";

// v2 capabilities bento — replaces Pillars + Governance with one grid. Rule: every card names a
// SHIPPED command or guard() flag, not a roadmap item. Six cards, three proof surfaces: static
// analysis before the run, hard enforcement during it, receipts + CI after.
const CARDS: { k: string; t: string; b: string }[] = [
  {
    k: "breakerbox ceiling",
    t: "A provable cost ceiling",
    b: "A worst-case dollar bound computed before the run — zero API calls. A reachable loop with no cap is reported UNBOUNDED, not guessed at.",
  },
  {
    k: "detect_loops=True",
    t: "Catches runaways",
    b: "Fuzzy repeat detection trips a spinning loop before the budget pays for it. A live $spent counter climbs in your terminal; max_depth stops a run from nesting past its own cap.",
  },
  {
    k: 'on_trip="pause"',
    t: "Stops that don't corrupt",
    b: "Enforcement lands between steps, never mid-call. Pause checkpoints state so you resume, not restart; kill lists every side effect that already fired.",
  },
  {
    k: "sub_budgets={...}",
    t: "Hierarchical escrow",
    b: "A parent workflow holds $5.00; sub-agents draw slices they can't exceed. Reserve before dispatch, reconcile after — parallel branches can't race past the ceiling.",
  },
  {
    k: "breakerbox flow --strict",
    t: "The security suite",
    b: "New in 0.11.0: scan exported flows for embedded credentials, audit MCP server configs, prove denial-of-wallet exposure — and block side effects after untrusted input, at runtime.",
  },
  {
    k: "breakerbox lock --check",
    t: "A CI gate for cost",
    b: "Pin prices and ceilings in a lockfile, diff budgets between commits, fail the build on new findings. A budget regression is a failing test, not a surprise invoice.",
  },
];

export default function Capabilities() {
  return (
    <section id="capabilities">
      <div className="wrap">
        <Reveal>
          <span className="eyebrow">What&apos;s in the box</span>
          <h2>
            Everything between you
            <br />
            and a $47,000 invoice.
          </h2>
          <p className="lede">
            Every card is a shipped command or a <code className="ledek">guard()</code> flag — not a
            roadmap. Static proof before the run, hard enforcement during it, receipts after.
          </p>
        </Reveal>
        <Reveal className="bento">
          {CARDS.map((c) => (
            <div className="bcard" key={c.t}>
              <span className="bk">{c.k}</span>
              <h3>{c.t}</h3>
              <p>{c.b}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
