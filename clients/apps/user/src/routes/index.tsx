import { createFileRoute } from "@tanstack/react-router"
import { Footer } from "../components/layout/footer"
import { HeroSection } from "../components/home/hero-section"
import { AboutSection } from "../components/home/about-section"
import { BenefitsSection } from "../components/home/benefits-section"
import { IngredientsSection } from "../components/home/ingredients-section"
import { PopularProducts } from "../components/home/popular-products"
import { ReviewsSection } from "../components/home/reviews-section"
import { StoreLocator } from "../components/home/store-locator"
import { StatsStrip } from "../components/home/stats-strip"
import { PromoBanner } from "../components/home/promo-banner"
import { FaqSection } from "../components/home/faq-section"
import { useMessages, usePageMetadata } from "../i18n"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const t = useMessages()
  usePageMetadata({
    title: t.meta.homeTitle,
    description: t.meta.homeDescription,
  })

  return (
    <div className="flex min-h-screen flex-col">
      <main>
        <HeroSection />
        <AboutSection />
        <BenefitsSection />
        <IngredientsSection />
        <PopularProducts />
        <ReviewsSection />
        <StoreLocator />
        <StatsStrip />
        <PromoBanner />
        <FaqSection />
      </main>
      <Footer />
    </div>
  )
}
