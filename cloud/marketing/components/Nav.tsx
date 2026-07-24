"use client";

import { useEffect, useRef, useState } from "react";
import BrandMark from "./BrandMark";
import { LINKS } from "./links";

const NAV = [
  { id: "how", label: "How it works" },
  { id: "pillars", label: "Product" },
  { id: "compare", label: "Compare" },
  { id: "why", label: "Why no run button" },
];

const RESOURCES = [
  { href: LINKS.dashboard, label: "Dashboard", desc: "Watch runs live · sign in for private runs" },
  { href: LINKS.docs, label: "Docs", desc: "Quickstart, builder guide, receipts" },
  { href: LINKS.roadmap, label: "Roadmap", desc: "Where Breakerbox is headed" },
  { href: LINKS.changelog, label: "Changelog", desc: "Releases and notes" },
  { href: LINKS.discussions, label: "Discussions", desc: "Ask and share" },
  { href: LINKS.issues, label: "Issues", desc: "Report a bug or request" },
];

// Repo whose stars we show. Configurable so the counter lights up the moment the repo is public
// (it's private today, so the API 404s and we fall back to the plain Star button — no error shown).
const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "Amitcoh1/agentbreaker";

// Compact star count: 1200 -> "1.2k", 12345 -> "12k", 999 -> "999".
function fmtCount(n: number) {
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
}

// Live star count, or null on any failure (private repo, rate limit, offline) -> plain Star button.
function useGitHubStars(repo: string) {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`https://api.github.com/repos/${repo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d && typeof d.stargazers_count === "number") setStars(d.stargazers_count);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [repo]);
  return stars;
}

export default function Nav() {
  const [active, setActive] = useState("");
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const stars = useGitHubStars(GITHUB_REPO);

  // Active link = the section currently in the middle band of the viewport (matches the design's
  // rootMargin). Toggles the underline on the matching nav link.
  useEffect(() => {
    const secs = [...document.querySelectorAll("section[id]")];
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-40% 0px -55% 0px" },
    );
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // Close the Resources dropdown on outside click or Escape (Escape returns focus to the trigger).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header>
      <div className="wrap">
        <nav>
          <a className="brand" href={LINKS.home} aria-label="Breakerbox home">
            <BrandMark width={24} height={35} />
            <span>breakerbox</span>
          </a>
          <div className="navlinks">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} data-nav className={active === n.id ? "on" : ""}>
                {n.label}
              </a>
            ))}

            <div className="navdrop" ref={dropRef}>
              <button
                ref={triggerRef}
                type="button"
                className={`navdrop-trigger${open ? " on" : ""}`}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-controls="nav-resources"
                onClick={() => setOpen((v) => !v)}
              >
                Resources
                <svg className="navdrop-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path
                    d="M2 3.5L5 6.5L8 3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {open && (
                <div className="navdrop-menu" id="nav-resources" role="menu" aria-label="Resources">
                  {RESOURCES.map((r) => (
                    <a
                      key={r.label}
                      href={r.href}
                      role="menuitem"
                      className="navdrop-item"
                      onClick={() => setOpen(false)}
                    >
                      <span className="navdrop-item-label">{r.label}</span>
                      <span className="navdrop-item-desc">{r.desc}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <a className="ghpill" href={LINKS.github}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>{" "}
              Star
              {stars !== null && <span className="ghcount">{fmtCount(stars)}</span>}
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
