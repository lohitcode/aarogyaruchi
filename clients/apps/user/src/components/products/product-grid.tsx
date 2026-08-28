import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import type { Product } from "../../lib/api"
import { catalogCategories } from "../../lib/catalog"
import { useMessages } from "../../i18n"
import { CategoryFilter } from "./category-filter"
import { ProductCard } from "./product-card"

type ProductGridProps = {
  /** From the /products route loader — guaranteed resolved before render. */
  products: Product[]
  /** True when the loader's catalog fetch failed. */
  failed?: boolean
}

export function ProductGrid({ products, failed }: ProductGridProps) {
  const [category, setCategory] = useState("all")
  const t = useMessages()

  const categories = useMemo(() => catalogCategories(products), [products])

  const filtered =
    category === "all"
      ? products
      : products.filter((p) => p.category === category)

  if (failed) {
    return <p className="text-destructive">{t.shop.loadProductsFailed}</p>
  }

  return (
    <div>
      {categories.length > 1 && (
        <div className="mb-10 flex">
          <CategoryFilter
            value={category}
            onChange={setCategory}
            categories={categories}
          />
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="sync">
          {filtered.map((product, i) => (
            <motion.div
              key={product.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ProductCard product={product} index={i} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {filtered.length === 0 && (
        <p className="text-muted-foreground">{t.shop.emptyCatalog}</p>
      )}
    </div>
  )
}
