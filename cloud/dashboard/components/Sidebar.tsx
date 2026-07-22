"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Blocks, LayoutDashboard, ListChecks } from "lucide-react";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/runs", label: "Runs", icon: ListChecks },
  { href: "/builder", label: "Builder", icon: Blocks },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 md:flex">
      <div className="mb-3 flex items-center gap-2 px-2 py-2">
        <Image src="/mark-dark.svg" alt="" width={24} height={24} />
        <span className="text-[15px] font-semibold tracking-tight">breakerbox</span>
      </div>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active ? "bg-ink/[0.06] font-medium text-fg" : "text-muted hover:bg-ink/[0.04] hover:text-fg"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
      <div className="mt-auto px-3 text-xs text-muted">your agents can&apos;t outspend you</div>
    </aside>
  );
}
