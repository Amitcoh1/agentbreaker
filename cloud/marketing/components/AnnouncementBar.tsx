"use client";

import { useEffect, useState } from "react";
import { LATEST_VERSION, LINKS } from "./links";

// Announces the latest release. The dismissal key is version-scoped, so shipping a new version
// (bump LATEST_VERSION) re-shows the bar to everyone — with a small slide-in + a pulsing "new"
// pill. Both animations live in marketing.css and are disabled under prefers-reduced-motion.
const KEY = `ab_announce_${LATEST_VERSION}`;

export default function AnnouncementBar() {
  // Start hidden and reveal after the mount check, so the bar (and its slide-in) appears only for
  // people who haven't dismissed this version — and never flashes for those who have.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(KEY) !== "dismissed") setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="announce announce-in">
      <a className="announce-msg" href={LINKS.changelog}>
        <span className="announce-pill announce-pill-pulse">new</span>
        Breakerbox <b>v{LATEST_VERSION}</b> is here — <span className="announce-cta">read the release →</span>
      </a>
      <button
        className="announce-x"
        aria-label="Dismiss announcement"
        onClick={() => {
          localStorage.setItem(KEY, "dismissed");
          setShow(false);
        }}
      >
        ✕
      </button>
    </div>
  );
}
