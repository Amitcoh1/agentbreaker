import CopyPip from "./CopyPip";
import WatchReel from "./WatchReel";
import { LINKS } from "./links";

// v2 hero — statement + proof. Left: oversized headline, one-line sub, CTAs. Right: a run receipt
// card mid-trip (pure CSS, no JS) — the product's whole argument visible above the fold.
const HOPS: { n: string; w: number; amt: string; hot?: boolean }[] = [
  { n: "hop 3", w: 12, amt: "$0.09" },
  { n: "hop 7", w: 22, amt: "$0.16" },
  { n: "hop 9 ↺", w: 34, amt: "$0.24", hot: true },
  { n: "hop 11 ↺", w: 48, amt: "$0.33", hot: true },
];

export default function Hero() {
  return (
    <div className="hero2">
      <div>
        <span className="eyebrow">Open source · circuit breaker for AI agents</span>
        <h1>
          <span className="hl">Your agents</span>
          <br />
          <span className="hl">
            can&apos;t <span className="cut">outspend</span> you.
          </span>
        </h1>
        <p className="sub2">
          A hard dollar cap on the whole workflow, enforced between every step. When an agent
          loops, it trips — before the bill does.
        </p>
        <div className="ctas2">
          <a className="btn1" href={LINKS.dashboard}>
            Get started →
          </a>
          <CopyPip />
          <a className="btn2" href={LINKS.github}>
            GitHub
          </a>
        </div>
        <WatchReel />
        <p className="trust2">
          <b>MIT</b> · Python 3.11+ · in-process · <b>no server, no stored keys</b>
        </p>
      </div>

      <div className="hcard" role="img" aria-label="A live run tripped at $0.82 of a $0.90 cap">
        <div className="hbar">
          <i />
          <i />
          <i />
          <span className="t">research_pipeline · live run</span>
          <span className="tripped">⏻ tripped</span>
        </div>
        <div className="hbody">
          {HOPS.map((h) => (
            <div className={h.hot ? "hrow hot" : "hrow"} key={h.n}>
              <span>{h.n}</span>
              <span className="m">
                <i style={{ width: `${h.w}%` }} />
              </span>
              <span className="amt">{h.amt}</span>
            </div>
          ))}
          <div className="hrow stop">
            <span>⏻ stop</span>
            <span>loop detected · next hop blocked · 0 side effects</span>
            <span className="amt">$0.82</span>
          </div>
          <div className="hmeter">
            <i />
          </div>
          <div className="hmlab">
            <span>$0.82 spent</span>
            <span>cap $0.90</span>
          </div>
        </div>
      </div>
    </div>
  );
}
