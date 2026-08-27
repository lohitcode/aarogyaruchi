import { describe, expect, it } from "vitest"
import { faqs } from "../data/faq"
import { products } from "../data/products"
import { reviews } from "../data/reviews"
import { en, type Messages } from "./locales/en"
import { hi } from "./locales/hi"
import { te } from "./locales/te"

// `en` itself keeps literal catalog keys; widen for dynamic id lookups.
const english: Messages = en

/**
 * Structural shape of a locale file: path -> leaf kind ("string" | "number" |
 * "function" | "array" | "boolean"). Keys and kinds must match English
 * exactly, which is what "no untranslated keys in production views" needs.
 */
function shapeOf(value: unknown, path = "", out = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(value)) {
    out.set(path, `array(${value.length})`)
    return out
  }
  const kind = typeof value
  if (value === null) {
    out.set(path, "null")
    return out
  }
  if (kind === "object") {
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key]
      shapeOf(child, path ? `${path}.${key}` : key, out)
    }
    return out
  }
  out.set(path, kind)
  return out
}

const locales = [
  { name: "te", messages: te },
  { name: "hi", messages: hi },
]

describe("locale files", () => {
  for (const { name, messages } of locales) {
    it(`${name} has exactly the same key structure as en`, () => {
      expect([...shapeOf(messages)].sort()).toEqual([...shapeOf(en)].sort())
    })

    it(`${name} has no empty translations where English has text`, () => {
      const emptyPaths: string[] = []
      for (const [path, kind] of shapeOf(en)) {
        if (kind !== "string") continue
        const value = path
          .split(".")
          .reduce<unknown>(
            (acc, key) => (acc as Record<string, unknown>)?.[key],
            messages,
          )
        if (typeof value === "string" && value.length === 0) {
          const englishValue = path
            .split(".")
            .reduce<unknown>(
              (acc, key) => (acc as Record<string, unknown>)?.[key],
              en,
            )
          if (englishValue !== "") {
            emptyPaths.push(path)
          }
        }
      }
      expect(emptyPaths).toEqual([])
    })
  }

  for (const { name, messages } of locales) {
    describe(`${name} catalog covers all catalog data`, () => {
      it("covers every product", () => {
        for (const product of products) {
          expect(messages.catalog.products[product.id], product.id).toBeTruthy()
          expect(
            messages.catalog.products[product.id].ingredients.length,
            `${product.id} ingredients`,
          ).toBe(english.catalog.products[product.id].ingredients.length)
        }
      })

      it("covers every FAQ", () => {
        for (const faq of faqs) {
          expect(messages.catalog.faqs[faq.id], faq.id).toBeTruthy()
        }
      })

      it("covers every review", () => {
        for (const review of reviews) {
          expect(messages.catalog.reviews[review.id], review.id).toBeTruthy()
        }
      })
    })
  }

  it("keeps brand names, phone numbers and addresses untranslated", () => {
    // Spot-check invariants that must hold in every locale.
    for (const { messages } of locales) {
      expect(messages.catalog.faqs["faq-009"].answer).toContain("+91 89781 38585")
      expect(messages.footer.rights(2026, "Aarogya Ruchi")).toContain(
        "Aarogya Ruchi",
      )
    }
  })
})
