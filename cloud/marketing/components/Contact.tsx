import { EMAIL, LINKS } from "./links";

// Contact section (#78): usage help routes to the open (GitHub Discussions/Issues), collaboration to
// email. No form, no backend — fits the local-first, no-server-execution ethos. Uses the shared
// marketing.css section classes so it's a verbatim-brand port; both CTAs are secondary (btn2) so the
// earned brass stays with the final CTA.
export default function Contact() {
  return (
    <section id="contact">
      <div className="wrap">
        <span className="eyebrow">Questions · Collaboration</span>
        <h2>
          Need a hand,
          <br />
          or want to build together?
        </h2>
        <p className="lede">
          Wiring a budget into your agent and hit a wall, or wondering whether Breakerbox fits your
          stack? Ask in the open — you&apos;ll usually get a faster answer and it helps the next person.
          Building something adjacent, want to partner, or need hands-on help? Reach out directly.
        </p>
        <div className="ctas" style={{ opacity: 1, animation: "none" }}>
          <a className="btn2" href={LINKS.discussions}>
            Ask on GitHub Discussions
          </a>
          <a className="btn2" href={LINKS.email}>
            Email me
          </a>
        </div>
        <p style={{ marginTop: 14, fontSize: 13, color: "var(--tx3)" }}>
          Found a bug?{" "}
          <a href={LINKS.issues} style={{ color: "var(--tx2)" }}>
            Open an issue
          </a>
          . Prefer email?{" "}
          <a href={LINKS.email} style={{ color: "var(--tx2)" }}>
            {EMAIL}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
