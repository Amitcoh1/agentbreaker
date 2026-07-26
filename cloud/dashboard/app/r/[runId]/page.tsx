// Public, read-only share view of a run timeline (#10). Uses the anon Supabase client, so RLS
// returns rows only when runs.public = true — a private run is never exposed here. No keys, no auth.
import Link from "next/link";
import { supabase, type Run, type RunEvent } from "@/lib/supabase";
import RunDetail from "@/app/dashboard/runs/[runId]/RunDetail";

export const dynamic = "force-dynamic";

export default async function PublicRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const db = supabase(); // anon client — RLS gates to public runs only
  const [{ data: run }, { data: events }] = await Promise.all([
    db.from("runs").select("*").eq("run_id", runId).maybeSingle(),
    db.from("events").select("*").eq("run_id", runId).order("seq", { ascending: true }),
  ]);

  if (!run) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-muted">This run isn&apos;t available — it may be private, or it doesn&apos;t exist.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-primary hover:underline">
          breakerbox →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-muted">Shared run · read-only</span>
        <Link href="/" className="text-primary hover:underline">
          breakerbox →
        </Link>
      </div>
      <RunDetail run={run as Run} initialEvents={(events ?? []) as RunEvent[]} readOnly />
    </div>
  );
}
