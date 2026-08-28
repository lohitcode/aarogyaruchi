import { formatPaise } from "./api"
import { OG_CATALOG } from "./og-catalog.generated"

/** Shapes accepted by TanStack route `head().meta` (as used inline in __root). */
export type OgMetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }

const SITE_URL = "https://aarogyaruchi.com"
const SITE_CARD_IMAGE = `${SITE_URL}/og-image.jpg`
// Leaves room for the " From ₹X." tail appended after truncation.
const BODY_LIMIT = 130

/**
 * Server-rendered Open Graph / Twitter meta for a product page. Reads the
 * build-time catalog snapshot — the worker cannot fetch the API at request
 * time (same-zone redirect loop), so previews resolve without any network
 * call. Unknown slugs return [] and fall back to the root route's site card.
 */
export function ogMetaForProduct(slug: string): OgMetaTag[] {
  const product = OG_CATALOG[slug]
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
    { name: "twitter:image", content: image },
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
