"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Blocks, LayoutDashboard, ListChecks, LogOut, Settings } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";

const items = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/runs", label: "Runs", icon: ListChecks },
  { href: "/dashboard/builder", label: "Builder", icon: Blocks },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const path = usePathname();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 md:flex">
      <div className="mb-3 flex items-center gap-2 px-2 py-2">
        <Image src="/mark-dark.svg" alt="" width={24} height={24} className="mark-dark" />
        <Image src="/mark-light.svg" alt="" width={24} height={24} className="mark-light" />
        <span className="font-display text-[15px] font-semibold tracking-tight">breakerbox</span>
      </div>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
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
      <div className="mt-auto border-t border-border pt-1">
        <ThemeToggle />
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-ink/[0.04] hover:text-fg"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
      <div className="px-3 pt-1 text-xs text-muted">your agents can&apos;t outspend you</div>
    </aside>
  );
}
