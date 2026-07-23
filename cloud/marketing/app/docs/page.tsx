import { LINKS } from "@/components/links";

export const metadata = {
  title: "Docs · Breakerbox",
  description: "Breakerbox documentation — coming soon. Start from the README on GitHub.",
};

// Placeholder docs page. Full docs are tracked separately; for now, point to the README/GitHub.
export default function DocsPage() {
  return (
    <main className="gridbg">
      <div className="wrap">
        <section>
          <span className="eyebrow">Docs</span>
          <h2>Documentation is on the way.</h2>
          <p className="lede">
            The quickstart, builder guide, receipts, and security model are being written. Until
            they land, the README on GitHub is the fastest way in.
          </p>
          <div className="ctas" style={{ opacity: 1, animation: "none", justifyContent: "flex-start" }}>
            <a className="btn2" href={LINKS.github}>
              Read the README
            </a>
            <a className="btn2" href={LINKS.home}>
              Back to home
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
