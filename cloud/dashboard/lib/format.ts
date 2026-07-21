export const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : Math.abs(n) >= 1
      ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `$${n.toFixed(4)}`;

export const microToUsd = (m: number | null | undefined) => (m == null ? 0 : m / 1_000_000);

export const compact = (n: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const shortId = (id: string) => id.slice(0, 8);

export const timeAgo = (iso: string | null) => {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
};
