"use client";

import { useEffect } from "react";

// The thin brass progress bar at the very top (#progress), width = scroll fraction.
export default function ScrollProgress() {
  useEffect(() => {
    const bar = document.getElementById("progress");
    if (!bar) return;
    const onScroll = () => {
      const h = document.documentElement;
      bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100 + "%";
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => removeEventListener("scroll", onScroll);
  }, []);
  return <div id="progress" aria-hidden="true" />;
}
