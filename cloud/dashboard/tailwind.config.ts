import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0E14",
        surface: "#12161F",
        card: "#171B22",
        border: "#232A36",
        fg: "#E6EDF3",
        muted: "#8B949E",
        primary: "#3B82F6",
        accent: "#D97706",
        good: "#2EA043",
        bad: "#F85149",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(59,130,246,0.15), 0 8px 30px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
} satisfies Config;
