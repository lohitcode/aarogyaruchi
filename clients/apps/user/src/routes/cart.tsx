import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { useCart } from "../lib/cart";
import { useAuth } from "../lib/auth";
import { fetchCatalog } from "../lib/catalog";
import { formatPaise } from "../lib/api";
import { useMessages, usePageMetadata } from "../i18n";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Cart — Aarogya Ruchi" },
      {
        name: "description",
        content: "Review your cart and proceed to checkout.",
      },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { lines, totalPaise, setQuantity, remove, count } = useCart();
  const { requireAuth } = useAuth();
  const navigate = useNavigate();
  const t = useMessages();
  usePageMetadata({
    title: t.shop.cartTitle,
    description: t.shop.cartDescription,
  });

  // Product photos for cart rows (square, same treatment as the product
  // cards). Lines only carry variant ids, so resolve them through the cached
  // catalog; rows render a letter tile until it lands (or if it fails).
  const [imageByVariant, setImageByVariant] = useState<Record<number, string>>(
    {},
  );
  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((products) => {
        if (cancelled) return;
        const map: Record<number, string> = {};
        for (const product of products) {
          if (!product.image_url) continue;
          for (const variant of product.variants) {
            map[variant.id] = product.image_url;
          }
        }
        setImageByVariant(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (count === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <h1 className="text-foreground">{t.shop.emptyCart}</h1>
        <p className="mt-3 text-muted-foreground">{t.shop.emptyCartHint}</p>
        <Button
          onClick={() => navigate({ to: "/products" })}
          className="mt-8 rounded-sm bg-primary px-8 py-4 text-primary-foreground hover:bg-primary/90"
        >
          {t.shop.browseProducts}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 md:px-10">
      <h1 className="text-foreground">{t.shop.cartTitle}</h1>

      <ul className="mt-8 divide-y divide-black/10 border-y border-black/10">
        {lines.map((line) => (
          <li key={line.variant_id} className="flex items-center gap-4 py-5">
            <div className="h-20 w-20 shrink-0 overflow-hidden border border-black/10 bg-secondary">
              {imageByVariant[line.variant_id] ? (
                <img
                  src={imageByVariant[line.variant_id]}
                  alt={line.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary/5 text-2xl text-primary">
                  {line.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {line.name}
                {line.size_label ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {line.size_label}
                    {line.unit ? ` (${line.unit})` : ""}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatPaise(line.price_paise)} × {line.quantity} ={" "}
                {formatPaise(line.price_paise * line.quantity)}
              </p>
            </div>

            <div className="flex items-center gap-1 border border-black/15">
              <button
                type="button"
                aria-label={t.shop.decrease}
                className="px-3 py-2 text-foreground/70 hover:bg-secondary"
                onClick={() => setQuantity(line.variant_id, line.quantity - 1)}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-8 text-center text-sm font-medium">
                {line.quantity}
              </span>
              <button
                type="button"
                aria-label={t.shop.increase}
                className="px-3 py-2 text-foreground/70 hover:bg-secondary"
                onClick={() => setQuantity(line.variant_id, line.quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              aria-label={t.shop.remove}
              className="p-2 text-muted-foreground hover:text-destructive"
              onClick={() => remove(line.variant_id)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-lg font-medium text-foreground">
          {t.shop.total}: {formatPaise(totalPaise)}
        </p>
        <Button
          onClick={() => requireAuth(() => navigate({ to: "/checkout" }))}
          className="rounded-sm bg-primary px-8 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t.shop.checkout}
        </Button>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {t.shop.cartCodNote}{" "}
        <Link to="/products" className="underline">
          {t.shop.continueShopping}
        </Link>
      </p>
    </main>
  );
}
