import "./v3.css";
import LandingV3 from "@/components/LandingV3";

const title = "Breakerbox — your agents can't outspend you";
const description =
  "A hard dollar cap on the whole agent workflow, enforced between every step. The open-source circuit breaker for LangGraph agents — provable cost ceiling, runaway detection, no server, no stored keys.";

export const metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

// v3 "the trip is the hero" — single-page landing. The v2 components (Nav/Hero/HowItWorks/…)
// remain on disk; restore = revert this file. Design system + hero live-run logic live in
// app/v3.css and components/LandingV3.tsx.
export default function MarketingPage() {
  return <LandingV3 />;
}
