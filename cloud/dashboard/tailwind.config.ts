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
        // fixed brand colors (same in any mode) — unified with the marketing palette
        paper: "#faf9f5", // light — used as text on brass / colored buttons
        cream: "#f2f0e9", // marketing --tx
        slate: "#6b7280",
        brass: "#d4a017", // marketing --brass (the brand brass; earned-only)
        brassdark: "#b8860b", // darker brass for hover/press depth
        // dark surfaces (marketing palette — one brand)
        bg: "#0f1114", // marketing --bg
        surface: "#14171b", // ink — marketing --bg2
        card: "#181c21", // marketing --panel
        border: "#303841", // marketing --line2
        // foreground (cream) — tints of these read on dark
        fg: "#f2f0e9", // marketing --tx
        muted: "#98a1ad", // marketing --tx2
        ink: "#f2f0e9", // "ink tints" (bg-ink/5 …) are foreground tints in dark mode
        primary: "#f2f0e9", // neutral accent / data / links
        accent: "#98a1ad", // secondary = slate-light
        good: "#f2f0e9", // completed / positive = neutral (palette has no green)
        bad: "#d4a017", // tripped / blocking / error = brass
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
