import type { Product } from "../../lib/api"
import { useCatalog } from "../../lib/catalog"
import { useMessages } from "../../i18n"
import { ProductCard } from "../products/product-card"
import { SectionLabel } from "../layout/section-label"

type SimilarProductsProps = {
  product: Product
}

export function SimilarProducts({ product }: SimilarProductsProps) {
  const t = useMessages()
  const { products, loading } = useCatalog()
  const similar = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 3)

  if (!loading && similar.length === 0) return null

  return (
    <section className="mt-24">
      <SectionLabel number="02" title={t.productDetail.similarLabel} />
      <h2 className="mt-6">{t.productDetail.similarHeading}</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {similar.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </section>
  )
}
