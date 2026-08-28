import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import type { Product } from "../../lib/api"
import { useMessages } from "../../i18n"
import { ProductCard } from "../products/product-card"
import { SectionWrapper } from "../layout/section-wrapper"
import { SectionLabel } from "../layout/section-label"

type PopularProductsProps = {
  /** From the home route loader — guaranteed resolved before render. */
  products: Product[]
}

export function PopularProducts({ products }: PopularProductsProps) {
  const t = useMessages()
  const featured = products.filter((p) => p.is_featured).slice(0, 3)
  if (featured.length === 0) return null

  return (
    <SectionWrapper id="products" className="bg-secondary/40">
      <SectionLabel number="04" title={t.popular.label} />

      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <h2 className="max-w-md">{t.popular.heading}</h2>
        <Link
          to="/products"
          className="group inline-flex items-center gap-2 text-sm font-medium text-foreground"
        >
          {t.popular.viewAll}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="mt-12 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} />
        ))}
      </div>
    </SectionWrapper>
  )
}
