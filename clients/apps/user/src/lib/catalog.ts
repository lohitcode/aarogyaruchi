import { useEffect, useState } from "react"
import { api, type Product } from "./api"

/**
 * The live catalog from GET /v1/products — the database is the single
 * source of truth for products, prices, and availability.
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

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const list = await fetchCatalog()
  return list.find((p) => p.slug === slug) ?? null
}

/** Hook: full catalog with loading/error state. */
export function useCatalog(): {
  products: Product[]
  loading: boolean
  error: string | null
} {
  const [products, setProducts] = useState<Product[]>(cache ? [...cache] : [])
  const [loading, setLoading] = useState(!cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache) {
      setProducts([...cache])
      setLoading(false)
      return
    }
    let cancelled = false
    fetchCatalog()
      .then((list) => {
        if (!cancelled) setProducts(list)
      })
      .catch(() => {
        if (!cancelled) setError("catalog unavailable")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { products, loading, error }
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
