import Link from "next/link";
import { type Run, type RunEvent } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import RunDetail from "./RunDetail";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const db = await createSupabaseServerClient();
  const [{ data: run }, { data: events }] = await Promise.all([
    db.from("runs").select("*").eq("run_id", runId).maybeSingle(),
    db.from("events").select("*").eq("run_id", runId).order("seq", { ascending: true }),
  ]);

  if (!run) {
    return (
      <div className="p-8">
        <p className="text-muted">
          Run not found (or not public).{" "}
          <Link href="/dashboard/runs" className="text-primary hover:underline">
            ← all runs
          </Link>
        </p>
      </div>
    );
  }

  return <RunDetail run={run as Run} initialEvents={(events ?? []) as RunEvent[]} />;
}
