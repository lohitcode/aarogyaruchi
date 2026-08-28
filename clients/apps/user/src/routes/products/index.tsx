import { createFileRoute } from "@tanstack/react-router"
import { Footer } from "../../components/layout/footer"
import { ProductGrid } from "../../components/products/product-grid"
import { SectionWrapper } from "../../components/layout/section-wrapper"
import { SectionLabel } from "../../components/layout/section-label"
import type { Product } from "../../lib/api"
import { fetchCatalog, useCatalogRecovery } from "../../lib/catalog"
import { useMessages, usePageMetadata } from "../../i18n"

export const Route = createFileRoute("/products/")({
  // Loader data is serialized to the client, so SSR and the client's first
  // render both have the catalog — no hydration mismatch, no loading flash.
  // When the worker can't reach the API (same-zone redirect loop), the page
  // renders a recovering state and the browser retry refills the data.
  loader: async () => {
    try {
      return { products: await fetchCatalog(), catalogFailed: false }
    } catch {
      return { products: [] as Product[], catalogFailed: true }
    }
  },
  component: ProductsPage,
})

function ProductsPage() {
  const { products, catalogFailed } = Route.useLoaderData()
  const retryFailed = useCatalogRecovery(catalogFailed)
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
            <ProductGrid
              products={products}
              recovering={catalogFailed && !retryFailed}
              failed={retryFailed}
            />
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </div>
  )
}
