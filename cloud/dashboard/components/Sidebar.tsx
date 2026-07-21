"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Blocks, LayoutDashboard, ListChecks, ShieldAlert } from "lucide-react";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/runs", label: "Runs", icon: ListChecks },
  { href: "/builder", label: "Builder", icon: Blocks },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface/60 p-4 md:flex">
      <div className="mb-2 flex items-center gap-2 px-2 py-3">
        <ShieldAlert className="h-5 w-5 text-primary" />
        <span className="font-semibold tracking-tight">AgentBreaker</span>
      </div>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active ? "bg-primary/15 text-fg" : "text-muted hover:bg-white/5 hover:text-fg"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
      <div className="mt-auto px-3 text-xs text-muted">FinOps for agent workflows</div>
    </aside>
  );
}
