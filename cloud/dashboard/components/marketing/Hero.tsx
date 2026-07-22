import CopyPip from "./CopyPip";
import { LINKS } from "./links";

export default function Hero() {
  return (
    <div className="hero">
      <span className="eyebrow">Open source · circuit breaker for AI agents</span>
      <h1>
        <span className="hl">Your agents can&apos;t</span>
        <br />
        <span className="hl">
          <span className="cut">outspend</span> you.
        </span>
      </h1>
      <p className="sub">
        A hard dollar budget on the workflow itself — hierarchical across sub-agents, enforced
        between steps, never a mid-flight 429. When a loop runs away, Breakerbox trips. Safely.
      </p>
      <div className="ctas">
        <CopyPip />
        <a className="btn2" href={LINKS.github}>
          View on GitHub
        </a>
      </div>
      <p className="trust">
        <b>MIT</b> · Python 3.11+ · in-process · <b>no server, no stored keys</b>
      </p>
    </div>
  );
}
