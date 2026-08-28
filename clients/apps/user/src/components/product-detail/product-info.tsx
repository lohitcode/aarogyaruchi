import { Button } from "@aarogyaruchi/ui/components/button";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useMessages } from "../../i18n";
import type { Product } from "../../lib/api";
import { formatPaise } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { productText } from "../../lib/product-text";
import { QuantityStepper } from "../products/quantity-stepper";
import { VariantQtySheet } from "../products/variant-qty-sheet";

type ProductInfoProps = {
  product: Product;
};

export function ProductInfo({ product }: ProductInfoProps) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { requireAuth } = useAuth();
  const { add } = useCart();
  const t = useMessages();
  const text = productText(t, product);

  // Multi-variant products skip the inline selector/stepper entirely — the
  // variant sheet (two-column sizes + prices) is the only add/edit surface.
  const isMulti = product.variants.length > 1;
  const variant = product.variants[0];
  const minPrice = product.variants.reduce(
    (min, v) => Math.min(min, v.price_paise),
    variant?.price_paise ?? 0
  );

  const addToCart = () => {
    if (!variant) return;
    add(
      {
        variant_id: variant.id,
        slug: variant.slug,
        name: product.name,
        size_label: variant.size_label,
        unit: variant.unit,
        price_paise: variant.price_paise,
      },
      quantity
    );
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  };

  const handleAddToCart = () => {
    if (isMulti) {
      requireAuth(() => setSheetOpen(true));
      return;
    }
    if (!variant) return;
    requireAuth(addToCart);
  };

  return (
    <div className="grid gap-10 md:grid-cols-2 md:gap-16">
      {/* Image — fills the frame (square, object-cover) like the product cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative aspect-square w-full overflow-hidden border border-black/10 bg-secondary"
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={text.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/5 text-7xl text-primary md:text-8xl">
            {text.name.charAt(0)}
          </div>
        )}
      </motion.div>

      {/* Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative flex flex-col justify-center"
      >
        <div className="flex flex-wrap gap-1.5">
          {text.tags.map((tag) => (
            <span
              key={tag}
              className="bg-secondary px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        <h1 className="mt-4 text-foreground">{text.name}</h1>

        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {text.description}
        </p>

        <p className="mt-6 text-3xl font-medium text-foreground md:text-4xl">
          {isMulti
            ? `${t.shop.from} ${formatPaise(minPrice)}`
            : formatPaise(minPrice)}
        </p>

        {/* Quantity + Add to cart (single-variant only) */}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          {!isMulti && (
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              increaseLabel={t.productDetail.increaseQuantity}
              decreaseLabel={t.productDetail.decreaseQuantity}
            />
          )}
          <Button
            onClick={handleAddToCart}
            disabled={!variant}
            className="flex-1 rounded-sm bg-primary px-8 py-5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 sm:flex-none"
          >
            {added ? t.productDetail.added : t.productDetail.addToCart}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      <VariantQtySheet
        product={product}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
