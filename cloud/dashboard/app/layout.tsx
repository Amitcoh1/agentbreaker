import "./globals.css";
import "@xyflow/react/dist/style.css";
import type { ReactNode } from "react";
import { Fira_Code, Inter } from "next/font/google";
import Sidebar from "@/components/Sidebar";

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const mono = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentbreaker-cyan.vercel.app"),
  title: "Breakerbox — the circuit breaker for AI agents",
  description:
    "Draw an agent workflow, get readable guarded Python. A hard dollar budget on the workflow itself — your agents can't outspend you. No server execution, no stored keys.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Breakerbox",
    description: "The circuit breaker for AI agents — your agents can't outspend you.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <div className="flex min-h-dvh">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
