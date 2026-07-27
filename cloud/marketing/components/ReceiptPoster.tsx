import Reveal from "./Reveal";

// The runaway problem, dramatized: a real run receipt spiralling to $385.70, stamped TRIPPED AT
// $5.00. A CSS "poster" (paper receipt + rotated stamp) — no images, on-brand with the mono/brass
// palette. Reuses the section/wrap/Reveal/eyebrow/h2/lede pattern; poster CSS lives in marketing.css.
const ITEMS: [string, string][] = [
  ["input tokens", "$0.84"],
  ["output tokens", "$1.23"],
  ["retry loop ×47", "$38.90"],
  ["self-reflection ×12", "$54.20"],
  ['"one more approach"', "$92.11"],
  ["infinite tool loop", "$198.42"],
];

export default function ReceiptPoster() {
  return (
    <section id="tripped" className="poster">
      <div className="wrap">
        <Reveal>
          <span className="eyebrow">The runaway problem</span>
          <h2>Your agent doesn&apos;t know when to stop.</h2>
          <p className="lede">
            A retry loop here, &ldquo;one more approach&rdquo; there — and you find out from the
            invoice. Breakerbox trips it at your dollar cap, mid-run, before the damage is done.
          </p>
        </Reveal>

        <Reveal>
          <div
            className="rpaper"
            role="img"
            aria-label="A run receipt totalling $385.70, stamped TRIPPED AT $5.00"
          >
            <div className="phead">
              <b>BREAKERBOX</b>
              <span>*RUN RECEIPT*</span>
            </div>
            <div className="psub">
              research_agent / run #1184
              <br />
              started 23:12 — still running 03:47
            </div>
            <div className="prule" />
            {ITEMS.map(([nm, amt]) => (
              <div className="pline" key={nm}>
                <span className="nm">{nm}</span>
                <span className="dots" />
                <span className="amt">{amt}</span>
              </div>
            ))}
            <div className="prule" />
            <div className="pline ptotal">
              <span className="nm">TOTAL</span>
              <span className="dots" />
              <span className="amt">$385.70</span>
            </div>
            <div className="pthanks">thank you, come again</div>
            <div className="pstamp">
              <b>Tripped</b>
              <span>at $5.00</span>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="postercta">
            <b>Breakerbox does.</b> Hard budget caps for LangGraph agents.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
