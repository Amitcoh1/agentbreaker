import "./marketing.css";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import AnnouncementBar from "@/components/AnnouncementBar";

// Merged root layout for the standalone marketing app. Inter is the body font (--font-sans →
// marketing --body); Space Grotesk (--font-display) and JetBrains Mono (--font-jbmono) are the
// display + mono faces. All three variables sit on <html> so they resolve inside the .mkt wrapper.
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
  weight: ["400", "500"],
  variable: "--font-jbmono",
});

const title = "Breakerbox — your agents can't outspend you";
const description =
  "A hard dollar budget on the workflow itself — hierarchical across sub-agents, enforced between steps, never a mid-flight 429. The open-source circuit breaker for AI agents. No server execution, no stored keys.";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentbreaker-cyan.vercel.app"),
  title,
  description,
  icons: { icon: "/favicon.svg" },
  openGraph: { title, description, type: "website", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${jbmono.variable}`}>
      <body>
        <div className="mkt">
          <AnnouncementBar />
          {children}
        </div>
      </body>
    </html>
  );
}
