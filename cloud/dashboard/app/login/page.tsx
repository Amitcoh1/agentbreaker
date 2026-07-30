"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function oauth(provider: "github" | "google") {
    setErr(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
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

  const oauthBtn =
    "flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface " +
    "px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-card";

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* left — auth */}
      <div className="flex items-center justify-center bg-bg px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <Image src="/mark-dark.svg" alt="" width={26} height={26} />
            <span className="text-lg font-semibold tracking-tight">breakerbox</span>
          </div>
          <h1 className="mb-1 text-2xl font-semibold text-fg">Sign in</h1>
          <p className="mb-7 text-sm text-muted">Access your runs, budgets, and saved graphs.</p>

          <div className="flex flex-col gap-3">
            <button onClick={() => oauth("github")} className={oauthBtn}>
              <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Continue with GitHub
            </button>
            <button onClick={() => oauth("google")} className={oauthBtn}>
              <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
              Continue with Google
            </button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" /> Or continue with{" "}
            <span className="h-px flex-1 bg-border" />
          </div>

          {sent ? (
            <p className="rounded-lg border border-border bg-surface p-3 text-sm text-fg">
              Check your inbox — we sent a sign-in link to <strong>{email}</strong>.
            </p>
          ) : (
            <form onSubmit={magicLink} className="flex flex-col gap-3">
              <label className="text-xs text-muted" htmlFor="email">
                Email
              </label>
              <input
                id="email"
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
                className="rounded-lg bg-brass px-4 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          )}
          {err && <p className="mt-4 text-sm text-brass">{err}</p>}
          <p className="mt-8 text-xs text-muted">
            No passwords stored. No provider keys ever leave your machine.
          </p>
        </div>
      </div>

      {/* right — brand showcase (hidden on small screens) */}
      <div className="relative hidden items-center justify-center overflow-hidden bg-[#0f1114] px-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "linear-gradient(#262b33 1px, transparent 1px), linear-gradient(90deg, #262b33 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="relative z-10 max-w-md">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-brass">
            Runtime spend enforcement
          </p>
          <h2 className="text-4xl font-bold leading-tight text-[#eef0f8]">
            Trip, degrade, and stop — not just alert.
          </h2>
          <p className="mt-4 text-[#aab0c0]">
            A hard dollar budget on the whole workflow, enforced between every step. Sign in to watch
            runs live, gate spend in CI, and read the receipt of exactly where the money went.
          </p>

          <div className="mt-8 rounded-xl border border-[#262b33] bg-[#16191e] p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs text-[#aab0c0]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#333a44]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#333a44]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#333a44]" />
              <span className="ml-1 font-mono">research_pipeline · live run</span>
              <span className="ml-auto font-mono font-bold text-[#e5484d]">⏻ tripped</span>
            </div>
            <div className="font-mono text-sm text-[#aab0c0]">
              <div className="flex justify-between">
                <span>loop detected · next hop blocked</span>
                <span className="text-[#d4a017]">$0.82</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0c0e12]">
                <div className="h-full w-[91%] rounded-full bg-[#d4a017]" />
              </div>
              <div className="mt-1 flex justify-between text-xs">
                <span>$0.82 spent</span>
                <span>cap $0.90</span>
              </div>
            </div>
          </div>

          <p className="mt-8 font-mono text-xs text-[#aab0c0]">
            MIT · Python 3.11+ · in-process · <span className="text-[#eef0f8]">no stored keys</span>
          </p>
        </div>
      </div>
    </main>
  );
}
