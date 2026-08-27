import type { Product } from "./api"
import { en } from "../i18n/locales/en"
import type { Messages } from "../i18n/locales/en"
import type { ProductMessages } from "../i18n/types"

// Widen the raw English literal so ids can be looked up dynamically.
const enMessages: Messages = en

/**
 * Localized overlay for a catalog product. Locale files may carry a
 * translation keyed by the product slug; anything missing falls back to the
 * database content (which the operator manages directly).
 */
export function productText(t: Messages, product: Product): ProductMessages {
  return (
    t.catalog.products[product.slug] ??
    enMessages.catalog.products[product.slug] ?? {
      name: product.name,
      description: product.description ?? "",
      ingredients: product.ingredients,
      tags: product.tags,
    }
  )
}
