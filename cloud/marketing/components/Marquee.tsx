import { Fragment } from "react";

const ITEMS = [
  "LangGraph",
  "OpenAI",
  "Anthropic",
  "Mistral",
  "Ollama",
  "CrewAI (soon)",
  "LiteLLM-compatible",
  "OpenTelemetry (soon)",
];

// The design duplicates the track (innerHTML += innerHTML) for a seamless -50% loop; here the set
// is rendered twice. Fragments keep each item/sep as a direct flex child of .mtrack (so the 64px
// gap lands between every span, as in the design). Pause-on-hover is CSS.
function Set({ prefix }: { prefix: string }) {
  return (
    <>
      {ITEMS.map((it) => (
        <Fragment key={prefix + it}>
          <span>{it}</span>
          <span className="sep">·</span>
        </Fragment>
      ))}
    </>
  );
}

export default function Marquee() {
  return (
    <div className="marquee" aria-hidden="true">
      <div className="mtrack" id="mtrack">
        <Set prefix="a-" />
        <Set prefix="b-" />
      </div>
    </div>
  );
}
