import type { Config } from "tailwindcss";

// Breakerbox palette — one brand across all three sites. Two families of color:
//  • FIXED brand colors (brass/paper/cream/slate) — identical in light and dark.
//  • THEMED tokens (bg/surface/card/border/fg/muted…) — resolved from CSS variables so a single
//    `data-theme` swap on <html> repaints the whole app. The vars hold RGB *channels* (e.g. "15 17 20")
//    so Tailwind's opacity modifiers (bg-ink/5, text-fg/70) keep working via the <alpha-value> hook.
// THE ONE RULE: brass is earned — tripped/blocking states and the single primary CTA per screen only.
const themed = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // fixed brand colors (same in any mode)
        paper: "#faf9f5", // text on brass / colored buttons
        cream: "#f2f0e9",
        slate: "#6b7280",
        brass: "#d4a017", // the brand brass (earned-only)
        brassdark: "#b8860b", // hover/press depth
        bad: "#d4a017", // tripped / blocking / error = brass, in both modes
        // themed tokens (light/dark via --c-* channels)
        bg: themed("--c-bg"),
        surface: themed("--c-surface"),
        card: themed("--c-card"),
        border: themed("--c-border"),
        fg: themed("--c-fg"),
        muted: themed("--c-muted"),
        // "foreground tints" — ink/primary/good all read as the foreground colour; accent = muted
        ink: themed("--c-fg"),
        primary: themed("--c-fg"),
        good: themed("--c-fg"),
        accent: themed("--c-muted"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jbmono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.4)",
        glow: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
} satisfies Config;
