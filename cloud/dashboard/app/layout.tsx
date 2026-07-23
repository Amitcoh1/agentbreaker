import "./globals.css";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

// Inter is shared: the dashboard body font (--font-sans) and the marketing body font (--body).
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://breakerbox-cyan.vercel.app"),
  title: "Breakerbox — your agents can't outspend you",
  description:
    "A hard dollar budget on the workflow itself — hierarchical across sub-agents, enforced between steps. The circuit breaker for AI agents. No server execution, no stored keys.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
