"use client";

import { useEffect, useState } from "react";

// Opens the recorded reel (public/reel/reel.mp4) in a lightbox with native controls — works on
// desktop and mobile (playsInline). The user hits play, so audio is never gated.
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
            <video className="reel-video" src="/reel/reel.mp4" controls playsInline preload="metadata" />
          </div>
        </div>
      )}
    </>
  );
}
