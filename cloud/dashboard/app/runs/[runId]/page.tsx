import Link from "next/link";
import { supabase, type Run, type RunEvent } from "@/lib/supabase";
import Timeline from "./timeline";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const db = supabase();
  const [{ data: run }, { data: events }] = await Promise.all([
    db.from("runs").select("*").eq("run_id", runId).maybeSingle(),
    db.from("events").select("*").eq("run_id", runId).order("seq", { ascending: true }),
  ]);

  if (!run) {
    return (
      <main className="wrap">
        <p className="muted">
          Run not found (or not public). <Link href="/">← all runs</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <p>
        <Link href="/">← all runs</Link>
      </p>
      <Timeline run={run as Run} initialEvents={(events ?? []) as RunEvent[]} />
    </main>
  );
}
