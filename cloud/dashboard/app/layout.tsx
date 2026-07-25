import "./globals.css";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

// One type system across all three sites: Inter body (--font-sans), Space Grotesk display headings
// (--font-display), JetBrains Mono for numbers/code (--font-jbmono) — matches the marketing scale (#21).
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jbmono",
});

// Set the saved theme before first paint so there's no dark→light flash on load.
const themeInit = `(function(){try{var t=localStorage.getItem('ab_theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://breakerbox-cyan.vercel.app"),
  title: "Breakerbox — your agents can't outspend you",
  description:
    "A hard dollar budget on the workflow itself — hierarchical across sub-agents, enforced between steps. The circuit breaker for AI agents. No server execution, no stored keys.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${jbmono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
