import { LINKS } from "@/components/links";

export const metadata = {
  title: "Privacy · Breakerbox",
  description: "What the optional Breakerbox dashboard stores — and what it never touches.",
};

export default function PrivacyPage() {
  return (
    <main className="gridbg">
      <div className="wrap">
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "48px 0" }}>
          <span className="eyebrow">Privacy</span>
          <h2>What Breakerbox stores — and what it never touches.</h2>
          <p className="lede">
            A plain-language summary of what the <b>optional</b> Breakerbox cloud dashboard collects.
            The library itself runs entirely on your machine — nothing leaves your environment unless
            you set <code>report_to</code>.
          </p>

          <h3 style={{ marginTop: 32 }}>What we store (only if you use the dashboard)</h3>
          <ul style={{ lineHeight: 1.7 }}>
            <li>
              <b>Your account</b> — when you sign in with GitHub or an email magic link (via Supabase
              Auth), we store your email and basic profile (name, GitHub username, avatar).
            </li>
            <li>
              <b>Run metadata</b> — budgets, spend, savings, and the hop timeline: node names, model
              names, token counts, cost, side-effect flags, and trip reasons. Runs are private to your
              account by default; you can make one public to share it by link.
            </li>
            <li>
              <b>A hash of your ingest key</b> — only a sha256 hash is stored, never the key itself.
            </li>
          </ul>

          <h3 style={{ marginTop: 32 }}>What we never store</h3>
          <ul style={{ lineHeight: 1.7 }}>
            <li>
              <b>Your provider / LLM API keys</b> — they are never sent to Breakerbox. Bring-your-own-key
              features call the provider directly from your browser.
            </li>
            <li>
              <b>Your prompts or model outputs</b> — the event stream records node / model / token / cost,
              not prompt or completion text.
            </li>
          </ul>

          <h3 style={{ marginTop: 32 }}>Where it lives</h3>
          <p>
            Run data is stored in our Supabase database; the apps are hosted on Vercel. Access is
            row-level-security-scoped to your account.
          </p>

          <h3 style={{ marginTop: 32 }}>Cookies</h3>
          <p>
            Only an authentication session cookie, to keep you signed in. No third-party advertising or
            tracking cookies.
          </p>

          <h3 style={{ marginTop: 32 }}>Your control</h3>
          <p>
            You can delete individual runs, and request deletion of your account and data via{" "}
            <a href={LINKS.discussions}>GitHub Discussions</a>. Prefer zero cloud? Don&apos;t set{" "}
            <code>report_to</code> — receipts stay on your machine.
          </p>

          <p className="cmpnote" style={{ marginTop: 36 }}>
            This is a plain-language starting point, not legal advice — review and adapt it (and add a
            contact email) before relying on it.
          </p>
        </section>
      </div>
    </main>
  );
}
