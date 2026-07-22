import "@xyflow/react/dist/style.css";
import type { ReactNode } from "react";
import { Fira_Code } from "next/font/google";
import Sidebar from "@/components/Sidebar";

const mono = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Dashboard · Breakerbox",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${mono.variable} flex min-h-dvh`}>
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
