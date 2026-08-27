import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { useMessages, usePageMetadata } from "../i18n";

export const Route = createFileRoute("/order-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
  }),
  head: () => ({
    meta: [
      { title: "Order placed — Aarogya Ruchi" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderSuccessPage,
});

function OrderSuccessPage() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const t = useMessages();
  usePageMetadata({
    title: t.shop.orderPlacedTitle,
    description: t.shop.orderPlacedDescription,
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-20 text-center md:px-10">
      <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
      <h1 className="mt-6 text-foreground">{t.shop.orderPlacedTitle}</h1>
      <p className="mt-3 text-muted-foreground">
        {t.shop.orderPlacedDescription}
      </p>
      {code ? (
        <p className="mt-6 inline-block border border-black/15 bg-secondary px-4 py-2 font-mono text-lg tracking-wider text-foreground">
          {code}
        </p>
      ) : null}
      <p className="mt-6 text-sm text-muted-foreground">{t.shop.codReminder}</p>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Button
          onClick={() => navigate({ to: "/orders" })}
          className="rounded-sm bg-primary px-8 py-3 text-primary-foreground hover:bg-primary/90"
        >
          {t.shop.viewOrders}
        </Button>
        <Link
          to="/products"
          className="inline-flex items-center rounded-sm border border-black/15 px-8 py-3 text-sm font-medium text-foreground hover:bg-foreground hover:text-background"
        >
          {t.shop.continueShopping}
        </Link>
      </div>
    </main>
  );
}
