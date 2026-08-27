import { Link } from "@tanstack/react-router"
import { BUSINESS } from "../../config/business"
import { useMessages } from "../../i18n"

export function Footer() {
  const t = useMessages()

  const footerLinks = {
    shop: [
      { label: t.footer.shop.all, href: "/products" },
      { label: t.footer.shop.meals, href: "/products" },
      { label: t.footer.shop.snacks, href: "/products" },
      { label: t.footer.shop.drinks, href: "/products" },
    ],
    company: [
      { label: t.footer.company.about, anchor: "#about" },
      { label: t.footer.company.benefits, anchor: "#benefits" },
      { label: t.footer.company.reviews, anchor: "#reviews" },
      { label: t.footer.company.faq, anchor: "#faq" },
    ],
    legal: [
      { label: t.footer.legal.terms, href: "/terms-of-service" },
      { label: t.footer.legal.privacy, href: "/privacy" },
      { label: t.footer.legal.delete, href: "/delete-account" },
    ],
  }

  return (
    <footer className="border-t border-black/10 bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 md:px-10">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Logo & tagline */}
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary text-xl font-semibold text-primary-foreground">
                అ
              </span>
              <span className="text-lg font-medium tracking-tight text-foreground">
                Aarogya Ruchi
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              {t.footer.tagline}
            </p>
            <address className="mt-4 max-w-xs text-sm not-italic text-muted-foreground">
              <span className="block">
                {t.footer.ownedBy(BUSINESS.legalOperator)}
              </span>
              <span className="mt-1 block">{BUSINESS.address}</span>
              <a
                className="mt-1 block transition-colors hover:text-primary"
                href={`tel:${BUSINESS.phoneE164}`}
              >
                {BUSINESS.phoneDisplay}
              </a>
            </address>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {t.footer.shopTitle}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {footerLinks.shop.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-sm text-foreground/80 transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {t.footer.companyTitle}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {footerLinks.company.map((link) => (
                <li key={link.anchor}>
                  <a
                    href={link.anchor}
                    className="text-sm text-foreground/80 transition-colors hover:text-primary"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {t.footer.legalTitle}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-sm text-foreground/80 transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Legal row */}
        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-black/10 pt-6 text-sm text-muted-foreground md:flex-row md:items-center">
          <p>{t.footer.rights(new Date().getFullYear(), BUSINESS.brandName)}</p>
          <div className="flex gap-6">
            <Link
              to="/terms-of-service"
              className="transition-colors hover:text-primary"
            >
              {t.footer.terms}
            </Link>
            <Link
              to="/privacy"
              className="transition-colors hover:text-primary"
            >
              {t.footer.privacy}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
