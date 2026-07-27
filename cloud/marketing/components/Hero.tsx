import CopyPip from "./CopyPip";
import WatchReel from "./WatchReel";
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
        A hard dollar cap on the whole workflow, enforced between every step. When an agent loops,
        it trips — before the bill does.
      </p>
      <div className="ctas">
        <a className="btn1" href={LINKS.dashboard}>
          Get started →
        </a>
        <CopyPip />
        <a className="btn2" href={LINKS.github}>
          View on GitHub
        </a>
      </div>
      <WatchReel />
      <p className="trust">
        <b>MIT</b> · Python 3.11+ · in-process · <b>no server, no stored keys</b>
      </p>
    </div>
  );
}
