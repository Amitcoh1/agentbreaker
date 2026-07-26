import Reveal from "./Reveal";

// Surfaces the 0.7–0.9 capability set (governance / CI / FinOps). Reuses the HowItWorks section
// pattern (section/wrap/Reveal/flow3/f3/dotb) so it's on-brand with no new CSS.
const GROUPS = [
  {
    n: "01",
    title: "Prove & pin the cost",
    body: "A provable worst-case dollar ceiling — computed with zero API calls and baked into the generated code. Pin it in a lockfile, and fail CI when a prompt edit quietly raises it.",
  },
  {
    n: "02",
    title: "Catch runaways before the bill",
    body: "Semantic loop detection trips a repeating agent before the budget does — no LLM. A live spend counter in your terminal, a warn rail at 50/80/95%, and a cap on sub-agent nesting.",
  },
  {
    n: "03",
    title: "Govern & attribute",
    body: "Policy-as-code the build refuses to violate. An egress certificate of every endpoint the code can reach. Per-team chargeback tags and a blast-radius audit receipt on every run.",
  },
];

export default function Governance() {
  return (
    <section id="governance">
      <div className="wrap">
        <Reveal>
          <span className="eyebrow">Beyond the budget</span>
          <h2>Prove it. Pin it. Govern it.</h2>
          <p className="lede">
            Because the cost is static and deterministic, Breakerbox does what an
            observe-after-the-fact dashboard or a gateway proxy structurally can&apos;t — all local,
            no server, no keys.
          </p>
        </Reveal>
        <Reveal className="flow3">
          {GROUPS.map((g) => (
            <div className="f3" key={g.n}>
              <div className="dotb">{g.n}</div>
              <h3>{g.title}</h3>
              <p>{g.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
