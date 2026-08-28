import { createFileRoute, notFound } from "@tanstack/react-router"
import { Footer } from "../../components/layout/footer"
import { ProductInfo } from "../../components/product-detail/product-info"
import { ProductDetailsTabs } from "../../components/product-detail/product-details-tabs"
import { SimilarProducts } from "../../components/product-detail/similar-products"
import type { Product } from "../../lib/api"
import { fetchCatalog, useCatalogRecovery } from "../../lib/catalog"
import { useMessages } from "../../i18n"

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    // One catalog fetch resolves both the product and the similar-products
    // list; loader data hydrates the client so the page renders identically
    // to SSR. Only a RESOLVED catalog may answer not-found — an unreachable
    // API (worker same-zone redirect loop) recovers in the browser instead
    // of 404ing every direct load.
    let products: Product[]
    try {
      products = await fetchCatalog()
    } catch {
      return { product: null, products: [] as Product[], catalogFailed: true }
    }
    const product = products.find((p) => p.slug === params.slug)
    if (!product) throw notFound()
    return { product, products, catalogFailed: false }
  },
  component: ProductDetailPage,
  notFoundComponent: () => <ProductNotFound />,
})

function ProductNotFound() {
  const t = useMessages()
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center">
        <div className="px-6 py-32 text-center">
          <h1 className="text-foreground">{t.productDetail.notFoundTitle}</h1>
          <p className="mt-3 text-muted-foreground">
            {t.productDetail.notFoundBody}
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function ProductDetailPage() {
  const { product, products, catalogFailed } = Route.useLoaderData()
  const retryFailed = useCatalogRecovery(catalogFailed)
  const t = useMessages()
  usePageMetadataFromProduct(t, product?.name)

  // product is null only while the browser retries an SSR fetch that the
  // worker could not make — show the same shell SSR rendered.
  if (!product) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center px-6 py-32 text-center">
          <p className="text-muted-foreground">
            {retryFailed ? t.shop.loadProductsFailed : t.shop.loading}
          </p>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-6xl px-6 py-12 md:px-10 md:py-20">
        <ProductInfo product={product} />
        <ProductDetailsTabs product={product} />
        <SimilarProducts product={product} products={products} />
      </main>
      <Footer />
    </div>
  )
}

import { useEffect } from "react"
import type { Messages } from "../../i18n/locales/en"

function usePageMetadataFromProduct(t: Messages, name?: string) {
  useEffect(() => {
    if (!name) return
    document.title = t.meta.productTitle(name)
  }, [t, name])
}
