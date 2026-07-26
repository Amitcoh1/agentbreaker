"use client";

// Route-level error boundary — recovers a failed data fetch with a retry instead of a blank crash.
// Uses existing theme tokens; no page restyling. (#76 polish slice)
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-8">
      <div className="card p-8 text-center">
        <p className="text-sm text-bad">Something went wrong loading this page.</p>
        {error.message ? <p className="mt-1 text-xs text-muted">{error.message}</p> : null}
        <button
          onClick={reset}
          className="mt-4 rounded-lg border border-border px-4 py-2 text-sm text-fg hover:bg-ink/5"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
