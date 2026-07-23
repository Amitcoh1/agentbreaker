import { createBrowserClient } from "@supabase/ssr";

// Browser client that carries the auth session cookie, so RLS resolves auth.uid() for the user.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
