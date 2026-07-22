import CopyPip from "./CopyPip";
import { LINKS } from "./links";

export default function FinalCta() {
  return (
    <section className="ctafinal gridbg">
      <div className="wrap">
        <span className="eyebrow">Open source · MIT forever</span>
        <h2>
          Flip the switch
          <br />
          before your agents do.
        </h2>
        <div className="ctas" style={{ opacity: 1, animation: "none" }}>
          <CopyPip />
          <a className="btn2" href={LINKS.docs}>
            Read the docs
          </a>
        </div>
      </div>
    </section>
  );
}
