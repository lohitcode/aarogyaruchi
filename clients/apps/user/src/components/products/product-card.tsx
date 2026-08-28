import { Button } from "@aarogyaruchi/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useMessages } from "../../i18n";
import type { Product } from "../../lib/api";
import { formatPaise } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCart, useProductCart } from "../../lib/cart";
import { productText } from "../../lib/product-text";
import { QuantityStepper } from "./quantity-stepper";
import { VariantQtySheet } from "./variant-qty-sheet";

const MAX_PER_VARIANT = 50;

type ProductCardProps = {
  product: Product;
  index?: number;
};

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { requireAuth } = useAuth();
  const { add, setQuantity } = useCart();
  const { qtyByVariantId, totalQty } = useProductCart(product);
  const [added, setAdded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const t = useMessages();
  const text = productText(t, product);

  const firstVariant = product.variants[0];
  const isMulti = product.variants.length > 1;
  const minPrice = product.variants.reduce(
    (min, v) => Math.min(min, v.price_paise),
    firstVariant?.price_paise ?? 0
  );

  const quickAddFirst = () => {
    if (!firstVariant) return;
    add({
      variant_id: firstVariant.id,
      slug: product.slug,
      name: product.name,
      size_label: firstVariant.size_label,
      unit: firstVariant.unit,
      price_paise: firstVariant.price_paise,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!firstVariant) return;
    requireAuth(() => {
      if (isMulti) {
        setSheetOpen(true);
        return;
      }
      quickAddFirst();
    });
  };

  // In-cart stepper: single-variant products edit their one line directly;
  // multi-variant products open the sheet (the requested total is ignored).
  const handleStep = (next: number) => {
    if (isMulti || !firstVariant) {
      setSheetOpen(true);
      return;
    }
    if (next <= 0) {
      setQuantity(firstVariant.id, 0);
      return;
    }
    if (qtyByVariantId.has(firstVariant.id)) {
      setQuantity(firstVariant.id, next);
    } else {
      add(
        {
          variant_id: firstVariant.id,
          slug: product.slug,
          name: product.name,
          size_label: firstVariant.size_label,
          unit: firstVariant.unit,
          price_paise: firstVariant.price_paise,
        },
        next
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="group h-full"
    >
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="flex h-full flex-col overflow-hidden border border-black/10 bg-background transition-shadow hover:shadow-md"
      >
        {/* Product Image */}
        <div className="relative aspect-square w-full border-b border-black/10 bg-secondary">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={text.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/5">
              <span className="text-5xl text-primary">
                {text.name.charAt(0)}
              </span>
            </div>
          )}

          {text.tags.length > 0 && (
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              {text.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center justify-center bg-background/90 px-2.5 py-1 text-[11px] font-medium leading-none text-foreground whitespace-nowrap backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content — fixed name/description heights so every card is identical
            regardless of text length (truncate long, pad short), footer pinned
            to the bottom for a consistent baseline. */}
        <div className="flex flex-1 flex-col p-5">
          <h3 className="line-clamp-2 min-h-12 text-lg font-medium leading-tight text-foreground">
            {text.name}
          </h3>
          <p className="mt-2 line-clamp-2 min-h-12 text-sm leading-relaxed text-muted-foreground">
            {text.description}
          </p>

          <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-5">
            <span className="text-lg font-medium text-foreground">
              {firstVariant && product.variants.length > 1
                ? `${t.shop.from} ${formatPaise(minPrice)}`
                : formatPaise(minPrice)}
            </span>
            {totalQty > 0 ? (
              <QuantityStepper
                value={totalQty}
                onChange={handleStep}
                min={0}
                max={MAX_PER_VARIANT}
                size="compact"
                increaseLabel={t.productDetail.increaseQuantity}
                decreaseLabel={t.productDetail.decreaseQuantity}
              />
            ) : (
              <Button
                size="sm"
                className="rounded-sm bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={handleAdd}
                disabled={!firstVariant}
              >
                {added ? (
                  <>
                    <Check className="mr-1 h-4 w-4" />
                    {t.productDetail.added}
                  </>
                ) : (
                  <>
                    <Plus className="mr-1 h-4 w-4" />
                    {t.productDetail.add}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Link>
      <VariantQtySheet
        product={product}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </motion.div>
  );
}
