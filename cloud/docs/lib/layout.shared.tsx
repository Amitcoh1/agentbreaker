import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://breakerbox-cyan.vercel.app";

// Shared layout options (nav title/link + GitHub) for the docs + any home layout.
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <img src="/mark-dark.svg" alt="" width={20} height={20} className="brand-mark-dark" />
          <img src="/mark-light.svg" alt="" width={20} height={20} className="brand-mark-light" />
          Breakerbox
        </span>
      ),
      url: MARKETING_URL,
    },
    githubUrl: "https://github.com/Amitcoh1/agentbreaker",
  };
}
