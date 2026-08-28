import { Button } from "@aarogyaruchi/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@aarogyaruchi/ui/components/sheet";
import { Plus } from "lucide-react";
import { useMessages } from "../../i18n";
import type { Product, Variant } from "../../lib/api";
import { formatPaise } from "../../lib/api";
import { useCart, useProductCart } from "../../lib/cart";
import { productText } from "../../lib/product-text";
import { QuantityStepper } from "./quantity-stepper";

const MAX_PER_VARIANT = 50;

type VariantQtySheetProps = {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function variantLabel(variant: Variant) {
  return [variant.size_label ?? variant.slug, variant.unit]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Bottom sheet listing every variant (size) of a product with its price in a
 * two-column grid. Quantities write straight through to the cart — there is
 * no draft state, so the cart badge and footer totals track every +/- live.
 */
export function VariantQtySheet({
  product,
  open,
  onOpenChange,
}: VariantQtySheetProps) {
  const { add, setQuantity } = useCart();
  const { qtyByVariantId, totalQty } = useProductCart(product);
  const t = useMessages();
  const text = productText(t, product);

  const totalPaise = product.variants.reduce(
    (sum, v) => sum + (qtyByVariantId.get(v.id) ?? 0) * v.price_paise,
    0,
  );

  const setVariantQty = (variant: Variant, quantity: number) => {
    if (quantity <= 0) {
      setQuantity(variant.id, 0);
      return;
    }
    if (qtyByVariantId.has(variant.id)) {
      setQuantity(variant.id, quantity);
      return;
    }
    add(
      {
        variant_id: variant.id,
        slug: variant.slug,
        name: product.name,
        size_label: variant.size_label,
        unit: variant.unit,
        price_paise: variant.price_paise,
      },
      quantity,
    );
  };

  const itemsWord =
    totalQty === 1
      ? t.productDetail.variantSheet.item
      : t.productDetail.variantSheet.items;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:mx-auto sm:max-w-lg">
        <SheetHeader className="pr-12">
          <SheetTitle>{text.name}</SheetTitle>
          <SheetDescription>
            {t.productDetail.variantSheet.description}
          </SheetDescription>
        </SheetHeader>

        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto px-6 pb-2">
          {product.variants.map((variant) => {
            const qty = qtyByVariantId.get(variant.id) ?? 0;
            return (
              <div
                key={variant.id}
                className="flex flex-col gap-2 border border-black/10 p-3"
              >
                <span className="text-sm font-medium leading-tight text-foreground">
                  {variantLabel(variant)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatPaise(variant.price_paise)}
                </span>
                {qty > 0 ? (
                  <QuantityStepper
                    value={qty}
                    onChange={(next) => setVariantQty(variant, next)}
                    min={0}
                    max={MAX_PER_VARIANT}
                    size="compact"
                    increaseLabel={t.productDetail.increaseQuantity}
                    decreaseLabel={t.productDetail.decreaseQuantity}
                  />
                ) : (
                  <Button
                    size="sm"
                    className="rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => setVariantQty(variant, 1)}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t.productDetail.add}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-4">
          {totalQty > 0 && (
            <span className="text-sm text-muted-foreground">
              {totalQty} {itemsWord} · {formatPaise(totalPaise)}
            </span>
          )}
          <Button
            className="rounded-sm bg-primary px-8 text-primary-foreground hover:bg-primary/90"
            onClick={() => onOpenChange(false)}
          >
            {t.productDetail.variantSheet.done}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
