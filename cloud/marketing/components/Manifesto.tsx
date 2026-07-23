import Reveal from "./Reveal";

const NEVER = [
  "server-side execution of your graphs",
  "storing your provider API keys",
  "an LLM supervising the hot path",
];

export default function Manifesto() {
  return (
    <section id="why">
      <div className="wrap">
        <Reveal className="mani">
          <span className="eyebrow">Why no run button</span>
          <h2>
            The safest server is the one
            <br />
            that doesn&apos;t exist.
          </h2>
          <p>
            Flow-building platforms that execute workflows server-side — with your API keys stored
            next to them — became one of this year&apos;s favorite attack surfaces: unauthenticated
            RCEs, active exploitation, a spot on CISA&apos;s must-patch list. Not because of sloppy
            code. Because{" "}
            <strong>a server that runs user flows and holds credentials is a target by definition.</strong>
          </p>
          <p>
            So we removed the target. Breakerbox generates code instead of hosting it. Your graph
            becomes plain Python; it runs on your machine, where your keys already live.
          </p>
          <div className="never">
            {NEVER.map((t) => (
              <div className="nv" key={t}>
                <b>NEVER</b>
                {t}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
