import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "AgentBreaker",
  description: "Agent run receipts — projected vs. stopped.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
