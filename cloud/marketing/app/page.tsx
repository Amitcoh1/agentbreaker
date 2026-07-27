import Compare from "@/components/Compare";
import Contact from "@/components/Contact";
import CostForecast from "@/components/CostForecast";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import Governance from "@/components/Governance";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Integration from "@/components/Integration";
import Manifesto from "@/components/Manifesto";
import Marquee from "@/components/Marquee";
import Nav from "@/components/Nav";
import Pillars from "@/components/Pillars";
import ProductWindow from "@/components/ProductWindow";
import Quote from "@/components/Quote";
import ReceiptPoster from "@/components/ReceiptPoster";
import ScrollProgress from "@/components/ScrollProgress";
import Stats from "@/components/Stats";

const title = "Breakerbox — your agents can't outspend you";
const description =
  "A hard dollar budget on the workflow itself — hierarchical across sub-agents, enforced between steps, never a mid-flight 429. The open-source circuit breaker for AI agents. No server execution, no stored keys.";

export const metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

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
        <Marquee />
      </main>
      <HowItWorks />
      <Pillars />
      <Governance />
      <CostForecast />
      <Integration />
      <Compare />
      <Manifesto />
      <Stats />
      <Quote />
      <ReceiptPoster />
      <FinalCta />
      <Contact />
      <Footer />
    </>
  );
}
