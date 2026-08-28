import { createFileRoute } from "@tanstack/react-router"
import { Footer } from "../../components/layout/footer"
import { ProductGrid } from "../../components/products/product-grid"
import { SectionWrapper } from "../../components/layout/section-wrapper"
import { SectionLabel } from "../../components/layout/section-label"
import { fetchCatalog } from "../../lib/catalog"
import { useMessages, usePageMetadata } from "../../i18n"

export const Route = createFileRoute("/products/")({
  // Loader data is serialized to the client, so SSR and the client's first
  // render both have the catalog — no hydration mismatch, no loading flash.
  loader: async () => {
    const products = await fetchCatalog().catch(() => null)
    return { products: products ?? [], failed: products === null }
  },
  component: ProductsPage,
})

function ProductsPage() {
  const { products, failed } = Route.useLoaderData()
  const t = useMessages()
  usePageMetadata({
    title: t.meta.productsTitle,
    description: t.meta.productsDescription,
  })

  return (
    <div className="flex min-h-screen flex-col">
      <main>
        <SectionWrapper className="bg-background">
          <SectionLabel number="01" title={t.productsPage.label} />
          <h1 className="mt-6 max-w-2xl">{t.productsPage.title}</h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground md:text-lg">
            {t.productsPage.subtitle}
          </p>
          <div className="mt-12">
            <ProductGrid products={products} failed={failed} />
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </div>
  )
}
