// Real targets for the design's placeholder href="#" links.
// X/Twitter and LinkedIn have no account yet — pointed at the repo until one exists.
export const LINKS = {
  home: "/",
  github: "https://github.com/Amitcoh1/agentbreaker",
  pypi: "https://pypi.org/project/agentbreaker/",
  roadmap: "https://github.com/Amitcoh1/agentbreaker/blob/main/ROADMAP.md",
  changelog: "https://github.com/Amitcoh1/agentbreaker/releases",
  discussions: "https://github.com/Amitcoh1/agentbreaker/discussions",
  issues: "https://github.com/Amitcoh1/agentbreaker/issues",
  twitter: "https://github.com/Amitcoh1/agentbreaker",
  linkedin: "https://github.com/Amitcoh1/agentbreaker",
  docs: "/docs",
  // The app is a separate deploy now; point cross-domain to it (falls back to a relative path).
  builder: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/builder`,
} as const;

export const PIP = "pip install agentbreaker";
