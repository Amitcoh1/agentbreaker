"use client";

import { useState } from "react";
import { PIP } from "./links";

// The `pip install agentbreaker` copy button. Matches the design: label flips to "copied ✓"
// for 1400ms. Kept as a component because both the hero and final CTA use it.
export default function CopyPip() {
  const [label, setLabel] = useState("copy");
  const copy = () => {
    navigator.clipboard?.writeText(PIP);
    setLabel("copied ✓");
    setTimeout(() => setLabel("copy"), 1400);
  };
  return (
    <button className="pipbox" onClick={copy} data-pip>
      {PIP} <span className="cp">{label}</span>
    </button>
  );
}
