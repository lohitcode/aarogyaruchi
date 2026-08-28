import { createFileRoute, notFound } from "@tanstack/react-router"
import { Footer } from "../../components/layout/footer"
import { ProductInfo } from "../../components/product-detail/product-info"
import { ProductDetailsTabs } from "../../components/product-detail/product-details-tabs"
import { SimilarProducts } from "../../components/product-detail/similar-products"
import { fetchCatalog } from "../../lib/catalog"
import { useMessages } from "../../i18n"

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    // One catalog fetch resolves both the product and the similar-products
    // list; loader data hydrates the client so the similar section renders
    // identically to SSR.
    const products = await fetchCatalog().catch(() => null)
    const product = products?.find((p) => p.slug === params.slug) ?? null
    if (!product) throw notFound()
    return { product, products: products ?? [] }
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
  const { product, products } = Route.useLoaderData()
  const t = useMessages()
  usePageMetadataFromProduct(t, product.name)

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

function usePageMetadataFromProduct(t: Messages, name: string) {
  useEffect(() => {
    document.title = t.meta.productTitle(name)
  }, [t, name])
}
