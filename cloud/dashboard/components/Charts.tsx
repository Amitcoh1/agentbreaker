"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usd } from "@/lib/format";
import type { DailySpend } from "@/lib/supabase";

const AXIS = { stroke: "#98a1ad", fontSize: 11 } as const;
const GRID = "#303841"; // dark gridlines; data lines are cream (#cfc9ba) for contrast

export function ChartCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Tip({ label, value }: { label?: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-glow">
      {label && <div className="text-muted">{label}</div>}
      <div className="num font-semibold">{value}</div>
    </div>
  );
}

const usdTip = (p: any) =>
  p?.active && p?.payload?.[0] ? (
    <Tip label={String(p.payload[0].payload.name ?? p.label)} value={usd(Number(p.payload[0].value))} />
  ) : null;

export function SpendOverTime({ data }: { data: DailySpend[] }) {
  const rows = data.map((d) => ({
    name: new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    spent: d.spent_usd,
  }));
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="g-spend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cfc9ba" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#cfc9ba" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => usd(v)} />
          <Tooltip content={usdTip} />
          <Area type="monotone" dataKey="spent" stroke="#cfc9ba" strokeWidth={2} fill="url(#g-spend)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CumulativeCost({ points }: { points: { name: number; spent: number }[] }) {
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="g-cum" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cfc9ba" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#cfc9ba" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} label={{ value: "hop", position: "insideBottom", fill: "#98a1ad", fontSize: 10, dy: 10 }} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => usd(v)} />
          <Tooltip content={usdTip} />
          <Area type="monotone" dataKey="spent" stroke="#cfc9ba" strokeWidth={2} fill="url(#g-cum)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
