"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function githubSignIn() {
    setErr(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  async function magicLink(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/mark-dark.svg" alt="" width={26} height={26} />
          <span className="text-lg font-semibold tracking-tight">breakerbox</span>
        </div>
        <h1 className="mb-1 text-xl font-semibold text-fg">Sign in</h1>
        <p className="mb-6 text-sm text-muted">Access your runs, budgets, and saved graphs.</p>

        {/* Brass is the single primary CTA on this screen. */}
        <button
          onClick={githubSignIn}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brass px-4 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Continue with GitHub
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        {sent ? (
          <p className="rounded-lg border border-border bg-surface p-3 text-sm text-fg">
            Check your inbox — we sent a sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <form onSubmit={magicLink} className="flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none placeholder:text-muted focus:border-muted"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-fg hover:bg-surface disabled:opacity-60"
            >
              {loading ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}
        {err && <p className="mt-4 text-sm text-brass">{err}</p>}
      </div>
    </main>
  );
}
