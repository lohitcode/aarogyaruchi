import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { en } from "./locales/en"
import type { Messages } from "./locales/en"
import { hi } from "./locales/hi"
import { te } from "./locales/te"

export const LOCALES = ["en", "te", "hi"] as const
export type Locale = (typeof LOCALES)[number]

const LOCALE_STORAGE_KEY = "aarogya_ruchi_locale"

const messages: Record<Locale, Messages> = { en, te, hi }

/** BCP-47-ish tag for each locale, used for <html lang> and og:locale. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en",
  te: "te",
  hi: "hi",
}

const OG_LOCALES: Record<Locale, string> = {
  en: "en_IN",
  te: "te_IN",
  hi: "hi_IN",
}

export type I18nContextValue = {
  locale: Locale
  /** Switch locale and persist the explicit choice. */
  setLocale: (locale: Locale) => void
  /** Messages for the active locale (statically complete in every locale). */
  t: Messages
}

const I18nContext = createContext<I18nContextValue | null>(null)

function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as readonly string[]).includes(value)
}

/** Base language of a BCP-47 tag, lowercased ("te-IN" -> "te"). */
function baseLanguage(tag: string): string {
  return tag.trim().toLowerCase().split("-")[0] ?? ""
}

/**
 * Pick the initial locale: an explicitly stored choice wins, otherwise the
 * first browser language we support, otherwise English.
 */
export function detectLocale(
  stored: string | null,
  navigatorLanguages: readonly string[],
): Locale {
  if (isLocale(stored)) return stored
  for (const tag of navigatorLanguages) {
    const base = baseLanguage(tag)
    if (base === "te") return "te"
    if (base === "hi") return "hi"
    if (base === "en") return "en"
  }
  return "en"
}

export function getStoredLocale(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // English is the SSR/hydration baseline; the real locale is resolved right
  // after mount so server and first client render stay identical.
  const [locale, setLocaleState] = useState<Locale>("en")

  useEffect(() => {
    const navigatorLanguages =
      typeof navigator === "undefined"
        ? []
        : (navigator.languages ?? [navigator.language])
    setLocaleState(detectLocale(getStoredLocale(), navigatorLanguages))
  }, [])

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[locale]
    const ogLocale = document.querySelector(
      'meta[property="og:locale"]',
    )
    if (ogLocale) ogLocale.setAttribute("content", OG_LOCALES[locale])
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the choice still applies
      // for this visit.
    }
  }, [])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: messages[locale] }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider")
  }
  return ctx
}

/** Messages for the active locale: `const t = useMessages()` then `t.nav.login`. */
export function useMessages(): Messages {
  return useI18n().t
}

type PageMetadata = {
  title: string
  description?: string
}

/** Keep document.title/description in sync with the active locale for a page.
 * Pages derive title/description from the locale files, so they already
 * change when the locale does. */
export function usePageMetadata({ title, description }: PageMetadata) {
  useEffect(() => {
    document.title = title
    if (!description) return
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute("content", description)
  }, [title, description])
}
