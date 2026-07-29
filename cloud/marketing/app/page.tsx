import Capabilities from "@/components/Capabilities";
import Compare from "@/components/Compare";
import Contact from "@/components/Contact";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Nav from "@/components/Nav";
import Quickstart from "@/components/Quickstart";
import ReceiptPoster from "@/components/ReceiptPoster";
import ScrollProgress from "@/components/ScrollProgress";

const title = "Breakerbox — your agents can't outspend you";
const description =
  "A hard dollar cap on the whole agent workflow, enforced between every step. The open-source circuit breaker for LangGraph agents — provable cost ceiling, runaway detection, no server, no stored keys.";

export const metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

// v2 sharp cut — nine beats, one argument:
//   hook + proof (Hero w/ tripped-run card) → mechanism (Reserve/Execute/Reconcile) → the pain
//   ($385 receipt) → what you get (Capabilities bento) → do it now (Quickstart terminal) → why us
//   (Compare) → CTA → Contact → Footer.
// Cut from v1 (components remain on disk, restore = one import): ProductWindow, Marquee,
// Pillars + Governance (folded into Capabilities), CostForecast, Integration, Manifesto, Stats, Quote.
export default function MarketingPage() {
  return (
    <>
      <ScrollProgress />
      <Nav />
      <main className="gridbg">
        <div className="wrap">
          <Hero />
        </div>
      </main>
      <HowItWorks />
      <ReceiptPoster />
      <Capabilities />
      <Quickstart />
      <Compare />
      <FinalCta />
      <Contact />
      <Footer />
    </>
  );
}
