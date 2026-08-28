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
