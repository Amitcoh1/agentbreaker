import Compare from "@/components/marketing/Compare";
import FinalCta from "@/components/marketing/FinalCta";
import Footer from "@/components/marketing/Footer";
import Hero from "@/components/marketing/Hero";
import HowItWorks from "@/components/marketing/HowItWorks";
import Integration from "@/components/marketing/Integration";
import Manifesto from "@/components/marketing/Manifesto";
import Marquee from "@/components/marketing/Marquee";
import Nav from "@/components/marketing/Nav";
import Pillars from "@/components/marketing/Pillars";
import ProductWindow from "@/components/marketing/ProductWindow";
import Quote from "@/components/marketing/Quote";
import ScrollProgress from "@/components/marketing/ScrollProgress";
import Stats from "@/components/marketing/Stats";

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
      <Integration />
      <Compare />
      <Manifesto />
      <Stats />
      <Quote />
      <FinalCta />
      <Footer />
    </>
  );
}
