import { formatPaise } from "./api"
import { OG_CATALOG } from "./og-catalog.generated"

/** Shapes accepted by TanStack route `head().meta` (as used inline in __root). */
export type OgMetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }

/** Minimal shape og meta is built from — satisfied both by the build-time
 * snapshot entries and by normalized live KV entries. */
export type OgProductLike = {
  name: string
  description: string
  image: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  minPricePaise: number
}

const SITE_URL = "https://aarogyaruchi.com"
const SITE_CARD_IMAGE = `${SITE_URL}/og-image.jpg`
// Leaves room for the " From ₹X." tail appended after truncation.
const BODY_LIMIT = 130

/**
 * Normalizes the live link-preview entry the Go API syncs into the
 * OG_CATALOG KV namespace on every product mutation. Returns null for
 * anything malformed so the caller falls back to the build-time snapshot.
 */
export function normalizeOgEntry(raw: unknown): OgProductLike | null {
  if (!raw || typeof raw !== "object") return null
  const entry = raw as Record<string, unknown>
  if (typeof entry.name !== "string" || entry.name === "") return null
  return {
    name: entry.name,
    description: typeof entry.description === "string" ? entry.description : "",
    image: typeof entry.image === "string" && entry.image !== "" ? entry.image : null,
    imageWidth: typeof entry.imageWidth === "number" ? entry.imageWidth : null,
    imageHeight: typeof entry.imageHeight === "number" ? entry.imageHeight : null,
    minPricePaise: typeof entry.minPricePaise === "number" ? entry.minPricePaise : 0,
  }
}

/**
 * Server-rendered Open Graph / Twitter meta for a product page.
 *
 * `live` is the KV-backed entry read during SSR by the $slug loader — the
 * same data the Go API refreshes on every product mutation, so previews
 * track the live catalog without a rebuild. Without it (unknown slug, KV
 * miss, or a client-side navigation where the binding doesn't exist) the
 * build-time snapshot answers, and only a completely unknown slug falls
 * back to the root route's site card.
 */
export function ogMetaForProduct(slug: string, live?: OgProductLike | null): OgMetaTag[] {
  const product = live ?? OG_CATALOG[slug]
  if (!product) return []

  const title = `${product.name} — Aarogya Ruchi`
  const description = `${truncate(product.description)} From ${formatPaise(product.minPricePaise)}.`
  const image = product.image
    ? product.image.startsWith("/")
      ? `${SITE_URL}${product.image}`
      : product.image
    : SITE_CARD_IMAGE

  const meta: OgMetaTag[] = [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: `${SITE_URL}/products/${slug}` },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ]
  // The root route ships 1200x630 og:image dimensions for the site card —
  // override them with the product image's real size so scrapers stay
  // consistent. Meta dedup keeps the route-level (last) value.
  if (product.image) {
    if (product.imageWidth && product.imageHeight) {
      meta.push(
        { property: "og:image:width", content: String(product.imageWidth) },
        { property: "og:image:height", content: String(product.imageHeight) },
      )
    }
    meta.push({ property: "og:image:alt", content: title })
  }
  return meta
}

function truncate(text: string) {
  return text.length <= BODY_LIMIT ? text : `${text.slice(0, BODY_LIMIT).trimEnd()}…`
}
