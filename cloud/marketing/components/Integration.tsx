import Reveal from "./Reveal";

// Preformatted, syntax-highlighted exactly as the design. Kept as an HTML string so the pre
// whitespace and highlight spans survive JSX whitespace collapsing.
const CODE = `<span class="k">from</span> breakerbox <span class="k">import</span> guard

app = <span class="f">guard</span>(
    my_langgraph_app,
    budget_usd=<span class="s">5.00</span>,
    max_hops=<span class="s">50</span>,
    velocity_usd_per_min=<span class="s">2.0</span>,
    on_trip=<span class="s">"pause"</span>,
)

<span class="c"># same invoke you already call</span>
result = app.invoke(inputs)`;

export default function Integration() {
  return (
    <section>
      <div className="wrap">
        <div className="split">
          <Reveal>
            <span className="eyebrow">Five lines</span>
            <h2>
              Wrap it.
              <br />
              That&apos;s the integration.
            </h2>
            <ul className="checks">
              <li>
                <b>No proxy, no gateway, no Docker</b> — in-process with your LangGraph app
              </li>
              <li>
                <b>Dollar budgets, not token counts</b> — across every model in the chain
              </li>
              <li>
                <b>Cost-velocity tripwire</b> catches loops that step limits miss
              </li>
              <li>
                <b>A shareable HTML receipt</b> from every run — where the money went, hop by hop
              </li>
            </ul>
          </Reveal>
          <Reveal as="pre">
            <code dangerouslySetInnerHTML={{ __html: CODE }} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
