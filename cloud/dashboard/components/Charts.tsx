"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { microToUsd, usd } from "@/lib/format";
import type { DailySpend, SpendByModel as SBM, SpendByNode as SBN } from "@/lib/supabase";

const AXIS = { stroke: "#8B949E", fontSize: 11 } as const;
const GRID = "#232A36";

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
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => usd(v)} />
          <Tooltip content={usdTip} />
          <Area type="monotone" dataKey="spent" stroke="#3B82F6" strokeWidth={2} fill="url(#g-spend)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function HBar({ rows, color }: { rows: { name: string; spent: number }[]; color: string }) {
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => usd(v)} />
          <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={96} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={usdTip} />
          <Bar dataKey="spent" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SpendByModel({ data }: { data: SBM[] }) {
  const rows = data
    .slice(0, 6)
    .map((d) => ({ name: d.model.split("/").pop() ?? d.model, spent: microToUsd(d.spent_microusd) }));
  return <HBar rows={rows} color="#3B82F6" />;
}

export function TopNodes({ data }: { data: SBN[] }) {
  const rows = data.slice(0, 6).map((d) => ({ name: d.node, spent: microToUsd(d.spent_microusd) }));
  return <HBar rows={rows} color="#D97706" />;
}

export function CumulativeCost({ points }: { points: { name: number; spent: number }[] }) {
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="g-cum" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} label={{ value: "hop", position: "insideBottom", fill: "#8B949E", fontSize: 10, dy: 10 }} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => usd(v)} />
          <Tooltip content={usdTip} />
          <Area type="monotone" dataKey="spent" stroke="#3B82F6" strokeWidth={2} fill="url(#g-cum)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AvertedGauge({ pct, saved }: { pct: number; saved: string }) {
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={[{ name: "averted", value }]}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar background={{ fill: "#232A36" }} dataKey="value" cornerRadius={8} fill="#2EA043" />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num text-3xl font-semibold text-good">{pct.toFixed(0)}%</div>
          <div className="text-xs text-muted">waste averted</div>
          <div className="num mt-1 text-xs text-good">{saved} saved</div>
        </div>
      </div>
    </div>
  );
}
