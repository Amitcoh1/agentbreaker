"use client";

import { useEffect, useState } from "react";

// Opens the self-scored reel (public/reel/index.html) in a lightbox. Click the frame once to start
// (browsers gate its audio until the first interaction — the reel has a click-to-play gate).
export default function WatchReel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" className="reel-cta" onClick={() => setOpen(true)}>
        <span className="reel-cta-play" aria-hidden="true">▶</span> Watch the reel
      </button>
      {open && (
        <div
          className="reel-overlay"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Breakerbox reel"
        >
          <div className="reel-frame" onClick={(e) => e.stopPropagation()}>
            <button className="reel-close" onClick={() => setOpen(false)} aria-label="Close reel">
              ✕
            </button>
            <iframe src="/reel/index.html" title="Breakerbox reel" allow="autoplay; fullscreen" />
          </div>
        </div>
      )}
    </>
  );
}
