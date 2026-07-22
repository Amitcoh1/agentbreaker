import type { Config } from "tailwindcss";

// Breakerbox palette — DARK is the primary mode (Ink surfaces + Cream text, per the brand kit).
// THE ONE RULE: brass is earned — it appears on tripped/blocking states and the single primary
// CTA per screen, nowhere else. The "foreground" tokens (fg/ink/primary/good) resolve to cream so
// their opacity tints (e.g. bg-ink/5) read correctly on dark surfaces.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // fixed brand colors (same in any mode)
        paper: "#faf9f5", // light — used as text on brass / colored buttons
        cream: "#f5f3ec",
        slate: "#6b7280",
        brass: "#b8860b",
        brassdark: "#d4a017",
        // dark surfaces
        bg: "#16181c",
        surface: "#1f2328", // ink
        card: "#23272d",
        border: "#31363d",
        // foreground (cream) — tints of these read on dark
        fg: "#f2efe8",
        muted: "#9aa1a9",
        ink: "#f2efe8", // "ink tints" (bg-ink/5 …) are foreground tints in dark mode
        primary: "#f2efe8", // neutral accent / data / links
        accent: "#9aa1a9", // secondary = slate-light
        good: "#f2efe8", // completed / positive = neutral (palette has no green)
        bad: "#b8860b", // tripped / blocking / error = brass
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.4)",
        glow: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
} satisfies Config;
