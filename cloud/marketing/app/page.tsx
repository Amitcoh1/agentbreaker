import Compare from "@/components/Compare";
import Contact from "@/components/Contact";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Nav from "@/components/Nav";
import Pillars from "@/components/Pillars";
import ProductWindow from "@/components/ProductWindow";
import ReceiptPoster from "@/components/ReceiptPoster";
import ScrollProgress from "@/components/ScrollProgress";

const title = "Breakerbox — your agents can't outspend you";
const description =
  "A hard dollar cap on the whole agent workflow, enforced between every step. The open-source circuit breaker for LangGraph agents — no server execution, no stored keys.";

export const metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

// Reshaped to a lean, spacious "exaggerated minimalism" flow (ui-ux-pro-max): hook → proof →
// mechanism → capabilities → the pain → the differentiator → CTA. Cut the denser mid-page sections
// (Marquee, Governance, CostForecast, Integration, Manifesto, Stats, Quote) to kill the
// wall-of-data feel; the depth lives in the docs.
export default function MarketingPage() {
  return (
    <>
      <ScrollProgress />
      <Nav />
      <main className="gridbg">
        <div className="wrap">
          <Hero />
          <ProductWindow />
        </div>
      </main>
      <HowItWorks />
      <Pillars />
      <ReceiptPoster />
      <Compare />
      <FinalCta />
      <Contact />
      <Footer />
    </>
  );
}
