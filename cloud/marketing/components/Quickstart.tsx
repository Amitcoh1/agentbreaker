import Reveal from "./Reveal";
import { LINKS } from "./links";

// v2 quickstart — the hero's claim, executable. Highlighting preserved as a static HTML string
// (same pattern as ProductWindow's codepane); classes are scoped under .mkt .qterm.
const TERM = `<span class="pr">$</span> pip install breakerbox
<span class="cm"># wrap the app you already compiled</span>
<span class="kw">from</span> breakerbox <span class="kw">import</span> guard
app = <span class="br">guard</span>(compiled, budget_usd=<span class="st">5.00</span>, on_trip=<span class="st">"pause"</span>)
app.invoke(state)
<span class="cm"># … a loop runs away …</span>
<span class="br">⏻ BudgetPaused</span>: tripped at $5.00 · state checkpointed · resume() to continue
<span class="cm"># receipt → ./breakerbox_reports/run.html</span>`;

export default function Quickstart() {
  return (
    <section id="quickstart" className="qsec">
      <div className="wrap">
        <Reveal>
          <span className="eyebrow">Quickstart</span>
          <h2>Four lines to a hard cap.</h2>
          <p className="lede" style={{ marginInline: "auto" }}>
            No proxy to deploy, no keys to hand over, no YAML. Wrap the app you already have and
            set a number.
          </p>
        </Reveal>
        <Reveal className="qwrap">
          <div className="qterm">
            <div className="qbar">
              <i />
              <i />
              <i />
              <span className="t">~/agents — python</span>
            </div>
            <pre dangerouslySetInnerHTML={{ __html: TERM }} />
          </div>
        </Reveal>
        <Reveal>
          <div className="ctas2" style={{ opacity: 1, animation: "none", justifyContent: "center", marginTop: 36 }}>
            <a className="btn2" href={LINKS.docs}>
              Read the docs →
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
