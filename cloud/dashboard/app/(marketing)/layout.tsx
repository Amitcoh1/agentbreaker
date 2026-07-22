import "./marketing.css";
import type { ReactNode } from "react";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

// Marketing-only fonts. Inter (--font-sans) comes from the root layout and is reused as --body.
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

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className={`mkt ${display.variable} ${jbmono.variable}`}>{children}</div>;
}
