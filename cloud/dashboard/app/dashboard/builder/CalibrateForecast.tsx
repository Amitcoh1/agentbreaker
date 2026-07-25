"use client";

import { FileUp, X } from "lucide-react";
import { calibrate, type Calibration, type Receipt } from "@/lib/calibration";

// Feed the forecast real numbers from run receipts. The heuristic band guesses loop depth and output
// tokens; a receipt ({run_id}.report.json, written by guard()) measured them. Drop a few in and the
// band tightens toward what your runs actually cost. Parsing is best-effort — a non-receipt file is
// silently skipped rather than throwing, since users will grab the wrong json sometimes.
export default function CalibrateForecast({
  cal,
  onCal,
}: {
  cal: Calibration | null;
  onCal: (c: Calibration | null) => void;
}) {
  const onFiles = async (files: FileList) => {
    const receipts: Receipt[] = [];
    for (const f of Array.from(files)) {
      try {
        const j = JSON.parse(await f.text());
        if (j && Array.isArray(j.timeline)) receipts.push(j as Receipt);
      } catch {
        /* not a receipt — skip */
      }
    }
    onCal(receipts.length ? calibrate(receipts) : null);
  };

  const calibrated = cal && cal.runs >= 2 && (cal.loopIterationsP50 != null || cal.perModelOutputTokens);

  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Calibrate forecast</div>
        {calibrated && (
          <button
            onClick={() => onCal(null)}
            className="flex items-center gap-1 text-xs text-muted hover:text-fg"
            title="Back to heuristic defaults"
          >
            <X className="h-3 w-3" /> clear
          </button>
        )}
      </div>

      {calibrated ? (
        <p className="text-xs text-muted">
          Using <span className="text-brass">your last {cal!.runs} runs</span>
          {cal!.loopIterationsP50 != null && <> · loops ≈ {cal!.loopIterationsP50}–{cal!.loopIterationsP95}×</>}. The band
          reflects what these runs actually cost.
        </p>
      ) : (
        <p className="text-xs text-muted">
          {cal && cal.runs === 1
            ? "One run is an anecdote — add at least two receipts."
            : "Heuristic defaults. Drop in run receipts (.report.json) to tighten the band from your own runs."}
        </p>
      )}

      <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-border px-2 py-1.5 text-sm hover:bg-ink/5">
        <FileUp className="h-4 w-4" /> {calibrated ? "Add more receipts" : "Load receipts"}
        <input
          type="file"
          accept="application/json"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onFiles(e.target.files)}
        />
      </label>
    </div>
  );
}
