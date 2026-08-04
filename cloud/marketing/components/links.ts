// Real targets for the design's placeholder href="#" links.
// X/Twitter and LinkedIn have no account yet — pointed at the repo until one exists.
// The app (dashboard + builder) is a separate deploy; point cross-domain to it. When a real
// domain lands, set NEXT_PUBLIC_APP_URL and it overrides this interim Vercel URL.
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentbreaker-cyan.vercel.app";

// The latest published version — drives the announcement bar. Bump on each release (matches the
// pyproject version / the git tag). A new value re-shows the bar to everyone who dismissed the last.
export const LATEST_VERSION = "0.11.0";

// Where to reach a human — usage help via GitHub, collaboration via email.
export const EMAIL = "amit.cellebrite@gmail.com";

export const LINKS = {
  home: "/",
  privacy: "/privacy",
  github: "https://github.com/Amitcoh1/agentbreaker",
  email: `mailto:${EMAIL}?subject=Breakerbox`,
  // Phase-1 conversion goal: design partners who flip observe → enforcement on real spend.
  designPartner: `mailto:${EMAIL}?subject=${encodeURIComponent("Breakerbox — design partner")}`,
  pypi: "https://pypi.org/project/breakerbox/",
  roadmap: "https://github.com/Amitcoh1/agentbreaker/blob/main/ROADMAP.md",
  changelog: "https://github.com/Amitcoh1/agentbreaker/releases",
  discussions: "https://github.com/Amitcoh1/agentbreaker/discussions",
  issues: "https://github.com/Amitcoh1/agentbreaker/issues",
  twitter: "https://github.com/Amitcoh1/agentbreaker",
  linkedin: "https://github.com/Amitcoh1/agentbreaker",
  // Docs is its own deploy (cloud/docs); falls back to the local stub if the URL isn't set.
  docs: process.env.NEXT_PUBLIC_DOCS_URL ?? "/docs",
  builder: `${APP}/dashboard/builder`,
  dashboard: `${APP}/dashboard`,
} as const;

export const PIP = "pip install breakerbox";
