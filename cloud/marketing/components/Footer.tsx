import BrandMark from "./BrandMark";
import { LINKS } from "./links";

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Project",
    links: [
      { label: "GitHub", href: LINKS.github },
      { label: "PyPI", href: LINKS.pypi },
      { label: "Roadmap", href: LINKS.roadmap },
      { label: "Changelog", href: LINKS.changelog },
    ],
  },
  {
    title: "Docs",
    links: [
      { label: "Quickstart", href: LINKS.docs },
      { label: "Builder", href: LINKS.builder },
      { label: "Receipts", href: LINKS.docs },
      { label: "Security model", href: LINKS.docs },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Discussions", href: LINKS.discussions },
      { label: "Issues", href: LINKS.issues },
      { label: "X / Twitter", href: LINKS.twitter },
      { label: "LinkedIn", href: LINKS.linkedin },
    ],
  },
];

export default function Footer() {
  return (
    <div className="wrap">
      <footer>
        <div className="fgrid">
          <div className="fcol fbrand">
            <a className="brand" href={LINKS.home} aria-label="Breakerbox home">
              <BrandMark width={22} height={32} />
              <span>breakerbox</span>
            </a>
            <p>The circuit breaker for AI agents. Built in the open.</p>
          </div>
          {COLS.map((col) => (
            <div className="fcol" key={col.title}>
              <h3>{col.title}</h3>
              {col.links.map((l) => (
                <a key={l.label} href={l.href}>
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="fbot">
          <span>
            © 2026 Breakerbox · MIT license · <a href={LINKS.privacy}>Privacy</a>
          </span>
          <span>no server · no stored keys · no run button</span>
        </div>
      </footer>
    </div>
  );
}
