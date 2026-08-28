import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { api, type Product } from "./api"

/**
 * The live catalog from GET /v1/products — the database is the single
 * source of truth for products, prices, and availability.
 *
 * The module cache dedupes fetches within one runtime (browser tab or
 * server isolate); components must NOT read it during render. Data flows
 * through route loaders (loaderData is serialized to the client), so SSR
 * and the client's first render are identical — reading the cache in a
 * component reintroduces the hydration mismatch this layout fixed.
 */

let cache: Product[] | null = null
let inflight: Promise<Product[]> | null = null

export async function fetchCatalog(): Promise<Product[]> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = api
    .get<{ products: Product[] }>("/v1/products")
    .then((res) => {
      cache = res.products
      return res.products
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Distinct categories present in the catalog, in first-seen order. */
export function catalogCategories(products: Product[]): string[] {
  const seen: string[] = []
  for (const p of products) {
    if (p.category && !seen.includes(p.category)) {
      seen.push(p.category)
    }
  }
  return seen
}

/**
 * Server-side loaders cannot always reach the API: worker subrequests to the
 * proxied api.<zone> hostname redirect-loop at the Cloudflare edge (same-zone
 * fetch quirk), so on failure SSR returns `catalogFailed: true` and renders
 * the same recovering state the client's first render shows — hydration stays
 * exact. In the browser the direct fetch works: pull the catalog here, then
 * re-run the loaders so the route picks up the data. Returns true when the
 * browser retry itself failed (caller shows the error UI).
 */
export function useCatalogRecovery(catalogFailed: boolean): boolean {
  const router = useRouter()
  const [retryFailed, setRetryFailed] = useState(false)

  useEffect(() => {
    if (!catalogFailed) return
    let cancelled = false
    fetchCatalog()
      .then(() => {
        if (!cancelled) router.invalidate()
      })
      .catch(() => {
        if (!cancelled) setRetryFailed(true)
      })
    return () => {
      cancelled = true
    }
    // One retry per mount: catalogFailed stays true across the invalidation,
    // so depending on it alone must not retrigger the fetch.
  }, [catalogFailed, router])

  return retryFailed
}
