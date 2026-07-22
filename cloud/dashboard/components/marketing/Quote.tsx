import Reveal from "./Reveal";

export default function Quote() {
  return (
    <section>
      <div className="wrap">
        <Reveal className="quote">
          <p>
            &quot;Dashboards are autopsies. A budget that trips <em>between steps</em> is a seatbelt.
            Agents need seatbelts.&quot;
          </p>
          <div className="who">— the thesis behind breakerbox</div>
        </Reveal>
      </div>
    </section>
  );
}
