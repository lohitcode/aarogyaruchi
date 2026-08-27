/**
 * Shapes shared by every locale file. `en.ts` is the source of truth: the
 * Messages type is derived from it and the other locales are typed as
 * Messages, so TypeScript rejects a missing or wrongly-shaped translation.
 */

/** One translatable product entry, keyed by product id. */
export type ProductMessages = {
  name: string
  description: string
  ingredients: string[]
  tags: string[]
}

/** Translated FAQ entry, keyed by faq id. */
export type FaqMessages = {
  question: string
  answer: string
}

/** Translated review entry, keyed by review id. */
export type ReviewMessages = {
  text: string
  product: string
}

/** Structured legal-document block. Rendered by the legal page component. */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  /** Renders the fixed business contact list (anchored links come from config). */
  | { kind: "contact" }

export type LegalSection = {
  heading: string
  blocks: LegalBlock[]
}

export type LegalDoc = {
  eyebrow: string
  title: string
  lastUpdated: string
  sections: LegalSection[]
  contactLabels: {
    operator: string
    email: string
    phone: string
    address: string
    grievance: string
  }
}
