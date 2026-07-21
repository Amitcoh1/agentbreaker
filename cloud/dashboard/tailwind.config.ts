import type { Config } from "tailwindcss";

// Breakerbox palette. Light/paper is the primary mode. THE ONE RULE: brass is earned —
// it appears on tripped/blocking states and the single primary CTA per screen, nowhere else.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // brand
        ink: "#1f2328",
        paper: "#faf9f5",
        cream: "#f5f3ec",
        slate: "#6b7280",
        brass: "#b8860b",
        brassdark: "#d4a017",
        // semantic aliases (repointed to the brand to keep component churn low)
        bg: "#faf9f5", // paper
        surface: "#f3f1ea",
        card: "#fbfaf7",
        border: "#e6e3da",
        fg: "#1f2328", // ink
        muted: "#6b7280", // slate
        primary: "#1f2328", // neutral accent / data / links = ink (no more blue)
        accent: "#6b7280", // secondary = slate
        good: "#1f2328", // completed / positive = neutral ink (palette has no green)
        bad: "#b8860b", // tripped / blocking / error = brass
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(31,35,40,0.06), 0 4px 16px rgba(31,35,40,0.06)",
        glow: "0 1px 2px rgba(31,35,40,0.06), 0 6px 20px rgba(31,35,40,0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
