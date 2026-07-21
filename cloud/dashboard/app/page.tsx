import Link from "next/link";
import { money, supabase, type Run } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data } = await supabase()
    .from("runs")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  const runs = (data ?? []) as Run[];

  return (
    <main className="wrap">
      <h1>AgentBreaker · runs</h1>
      {runs.length === 0 ? (
        <p className="muted">No runs yet. Point a guard at this dashboard with <code>report_to=</code>.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>run</th>
              <th>status</th>
              <th className="num">hops</th>
              <th className="num">spent</th>
              <th className="num">projected</th>
              <th className="num">budget</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.run_id}>
                <td>
                  <Link href={`/runs/${r.run_id}`}>{r.run_id.slice(0, 8)}</Link>
                </td>
                <td>
                  <span className={`status s-${r.status ?? "unknown"}`}>
                    {r.status ?? "…"}
                    {r.trip_reason ? ` · ${r.trip_reason}` : ""}
                  </span>
                </td>
                <td className="num">{r.hops ?? "—"}</td>
                <td className="num">{money(r.spent_usd)}</td>
                <td className="num">{money(r.projected_uncapped_usd)}</td>
                <td className="num">{money(r.budget_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
