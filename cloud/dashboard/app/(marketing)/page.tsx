import Footer from "@/components/marketing/Footer";
import Hero from "@/components/marketing/Hero";
import Marquee from "@/components/marketing/Marquee";
import Nav from "@/components/marketing/Nav";
import ScrollProgress from "@/components/marketing/ScrollProgress";
import FinalCta from "@/components/marketing/FinalCta";

export default function MarketingPage() {
  return (
    <>
      <ScrollProgress />
      <Nav />
      <main className="gridbg">
        <div className="wrap">
          <Hero />
          {/* ProductWindow (the stage) — added in a later group */}
        </div>
        <Marquee />
      </main>
      {/* content sections — added in a later group */}
      <FinalCta />
      <Footer />
    </>
  );
}
