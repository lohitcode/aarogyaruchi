import { createFileRoute, notFound } from "@tanstack/react-router"
import { Footer } from "../../components/layout/footer"
import { ProductInfo } from "../../components/product-detail/product-info"
import { ProductDetailsTabs } from "../../components/product-detail/product-details-tabs"
import { SimilarProducts } from "../../components/product-detail/similar-products"
import type { Product } from "../../lib/api"
import { fetchCatalog, useCatalogRecovery } from "../../lib/catalog"
import { ogMetaForProduct, normalizeOgEntry, type OgProductLike } from "../../lib/og"
import { useMessages } from "../../i18n"

export const Route = createFileRoute("/products/$slug")({
  loader: async (opts) => {
    const { params } = opts
    // One catalog fetch resolves both the product and the similar-products
    // list; loader data hydrates the client so the page renders identically
    // to SSR. Only a RESOLVED catalog may answer not-found — an unreachable
    // API (worker same-zone redirect loop) recovers in the browser instead
    // of 404ing every direct load.
    let products: Product[] | null = null
    try {
      products = await fetchCatalog()
    } catch {
      // SSR fetch unreachable — browser retry recovers via useCatalogRecovery.
    }
    const product = products?.find((p) => p.slug === params.slug) ?? null
    if (products && !product) throw notFound()
    return {
      product,
      products: products ?? [],
      catalogFailed: products === null,
      og: await readLiveOgEntry(opts, params.slug),
    }
  },
  component: ProductDetailPage,
  notFoundComponent: () => <ProductNotFound />,
  // Per-product link previews prefer the live KV entry (refreshed on every
  // product mutation — no rebuild) and fall back to the build-time snapshot,
  // so tags render even while the page itself is recovering its live data in
  // the browser.
  // NOTE: keep head AFTER loader — declared earlier it trips circular type
  // inference and collapses the loader's return type to `never`
  // (TanStack/router#4740).
  head: ({ params, loaderData }) => ({
    meta: ogMetaForProduct(params.slug, loaderData?.og),
  }),
})

// The OG_CATALOG KV binding only exists in the worker (serverContext.env is
// threaded by src/server.ts during SSR); client navigations and local dev
// return null and the build-time snapshot answers instead.
async function readLiveOgEntry(
  opts: { serverContext?: { env?: Env } },
  slug: string,
): Promise<OgProductLike | null> {
  console.log("[og-debug] serverContext:", JSON.stringify(Object.keys((opts as Record<string, unknown>).serverContext ?? {})), "env:", !!opts.serverContext?.env)
  const namespace = opts.serverContext?.env?.OG_CATALOG
  if (!namespace) return null
  try {
    return normalizeOgEntry(await namespace.get(slug, "json"))
  } catch {
    return null
  }
}

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
