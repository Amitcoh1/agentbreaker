import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://agentbreaker-cyan.vercel.app";

// Shared layout options (nav title/link + GitHub) for the docs + any home layout.
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Breakerbox docs",
      url: MARKETING_URL,
    },
    githubUrl: "https://github.com/Amitcoh1/agentbreaker",
  };
}
