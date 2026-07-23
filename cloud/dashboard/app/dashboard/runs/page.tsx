import { type Run } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import RunsExplorer from "./RunsExplorer";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data } = await db
    .from("runs")
    .select("*")
    .eq("owner_id", user?.id ?? "")
    .order("updated_at", { ascending: false })
    .limit(200);
  return (
    <div className="p-6 lg:p-8">
      <h1 className="mb-4 text-lg font-semibold">Runs</h1>
      <RunsExplorer initial={(data ?? []) as Run[]} />
    </div>
  );
}
