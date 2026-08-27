import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, PackageOpen } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { api, formatPaise, type OrderSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { connectWs } from "../lib/ws";
import { useMessages, usePageMetadata } from "../i18n";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "My Orders — Aarogya Ruchi" },
      {
        name: "description",
        content: "Track your Aarogya Ruchi orders and deliveries.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const t = useMessages();
  usePageMetadata({
    title: t.shop.ordersTitle,
    description: t.shop.ordersDescription,
  });

  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get<{ orders: OrderSummary[] }>("/v1/orders?limit=50")
      .then((res) => setOrders(res.orders))
      .catch(() => setError(t.shop.loadOrdersFailed));
  }, [t]);

  useEffect(() => {
    if (!user) return;
    load();
    // Live updates: refetch on any order event, reconnect, or version gap.
    const close = connectWs({
      onEvent: (event) => {
        if (event.type.startsWith("order.")) load();
      },
      onReconnect: load,
    });
    return close;
  }, [user, load]);

  if (!authLoading && !user) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <p className="text-muted-foreground">{t.shop.loginToOrders}</p>
        <Button
          onClick={() => navigate({ to: "/products" })}
          className="mt-6 rounded-sm bg-primary px-6 py-3 text-primary-foreground"
        >
          {t.shop.browseProducts}
        </Button>
      </main>
    );
  }

  const statusLabel = (status: OrderSummary["status"]) =>
    t.shop.status[status] ?? status;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 md:px-10">
      <h1 className="text-foreground">{t.shop.ordersTitle}</h1>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {orders === null ? (
        <p className="mt-8 text-muted-foreground">{t.shop.loading}</p>
      ) : orders.length === 0 ? (
        <div className="mt-16 text-center">
          <PackageOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t.shop.noOrders}</p>
          <Button
            onClick={() => navigate({ to: "/products" })}
            className="mt-6 rounded-sm bg-primary px-6 py-3 text-primary-foreground"
          >
            {t.shop.browseProducts}
          </Button>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-black/10 border-y border-black/10">
          {orders.map((order) => (
            <li key={order.order_id}>
              <Link
                to="/orders/$id"
                params={{ id: String(order.order_id) }}
                className="flex items-center gap-4 py-5 transition-colors hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-muted-foreground">
                    {order.code}
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {t.shop.deliveryOn(order.delivery_date)} ·{" "}
                    {formatPaise(order.total_paise)}
                  </p>
                  <p
                    className={`mt-1 text-sm font-medium ${
                      order.status === "delivered"
                        ? "text-primary"
                        : order.status === "cancelled" ||
                            order.status === "delivery_failed"
                          ? "text-destructive"
                          : "text-foreground"
                    }`}
                  >
                    {statusLabel(order.status)}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 flex-none text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
