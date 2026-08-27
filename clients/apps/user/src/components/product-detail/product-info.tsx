import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import type { Product } from "../../lib/api";
import { formatPaise } from "../../lib/api";
import { useMessages } from "../../i18n";
import { productText } from "../../lib/product-text";
import { SizeSelector } from "./size-selector";
import { QuantityStepper } from "./quantity-stepper";
import { useAuth } from "../../lib/auth";
import { useCart } from "../../lib/cart";

type ProductInfoProps = {
  product: Product;
};

export function ProductInfo({ product }: ProductInfoProps) {
  const [selectedVariant, setSelectedVariant] = useState(
    product.variants[0] ? String(product.variants[0].id) : ""
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { requireAuth } = useAuth();
  const { add } = useCart();
  const t = useMessages();
  const text = productText(t, product);

  const variant = product.variants.find(
    (v) => String(v.id) === selectedVariant
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

  return (
    <div className="grid gap-10 md:grid-cols-2 md:gap-16">
      {/* Image */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex min-h-[320px] items-center justify-center overflow-hidden border border-black/10 bg-secondary p-6 md:min-h-[440px]"
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={text.name}
            className="max-h-[300px] max-w-full object-contain md:max-h-[380px]"
          />
        ) : (
          <div className="flex h-48 w-48 items-center justify-center bg-primary/5 text-7xl text-primary md:h-64 md:w-64">
            {text.name.charAt(0)}
          </div>
        )}
      </motion.div>

      {/* Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex flex-col justify-center"
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

        {variant && (
          <p className="mt-6 text-3xl font-medium text-foreground md:text-4xl">
            {formatPaise(variant.price_paise)}
          </p>
        )}

        {/* Size selector (live variants) */}
        {product.variants.length > 0 && (
          <div className="mt-8">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {t.productDetail.size}
            </p>
            <SizeSelector
              variants={product.variants}
              value={selectedVariant}
              onChange={setSelectedVariant}
            />
          </div>
        )}

        {/* Quantity + Add to cart */}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            increaseLabel={t.productDetail.increaseQuantity}
            decreaseLabel={t.productDetail.decreaseQuantity}
          />
          <Button
            onClick={() => requireAuth(addToCart)}
            disabled={!variant}
            className="flex-1 rounded-sm bg-primary px-8 py-5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 sm:flex-none"
          >
            {added ? t.productDetail.added : t.productDetail.addToCart}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
