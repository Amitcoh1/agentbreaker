import Reveal from "./Reveal";

const STEPS = [
  {
    n: "01",
    title: "Reserve",
    body: "Before dispatch: hold the maximum possible cost — input tokens + max_tokens × price. The hold counts as spent, so parallel branches can't race past the ceiling.",
  },
  {
    n: "02",
    title: "Execute",
    body: "The call runs to completion, always. Streaming output is metered chunk by chunk. Nothing is ever interrupted mid-flight.",
  },
  {
    n: "03",
    title: "Reconcile",
    body: "Actual cost is recorded, the difference released back to the pool — and the next hop only dispatches if the budget allows it.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how">
      <div className="wrap">
        <Reveal>
          <span className="eyebrow">The accounting</span>
          <h2>Reserve. Execute. Reconcile.</h2>
          <p className="lede">
            The same pattern your credit card uses — because knowing a call&apos;s true cost only
            after it finishes is exactly the hotel-checkout problem.
          </p>
        </Reveal>
        <Reveal className="flow3">
          {STEPS.map((s) => (
            <div className="f3" key={s.n}>
              <div className="dotb">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
