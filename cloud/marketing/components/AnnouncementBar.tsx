"use client";

import { useEffect, useState } from "react";
import { LINKS } from "./links";

// Bump this key whenever the announcement text changes — dismissals reset for everyone.
const KEY = "ab_announce_v0_1_0";

export default function AnnouncementBar() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(KEY) === "dismissed") setDismissed(true);
  }, []);

  if (dismissed) return null;

  return (
    <div className="announce">
      <a className="announce-msg" href={LINKS.changelog}>
        <span className="announce-pill">new</span>
        Breakerbox <b>v0.1.0</b> is here — <span className="announce-cta">read the release →</span>
      </a>
      <button
        className="announce-x"
        aria-label="Dismiss announcement"
        onClick={() => {
          localStorage.setItem(KEY, "dismissed");
          setDismissed(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
