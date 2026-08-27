import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bike } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import {
  api,
  formatPaise,
  type OrderDetail,
  type OrderStatus,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { connectWs } from "../lib/ws";
import { useMessages, usePageMetadata } from "../i18n";
import PointsMap from "../components/map/points-map";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order — Aarogya Ruchi" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderDetailPage,
});

const TIMELINE_FLOW: OrderStatus[] = [
  "placed",
  "confirmed",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
];

function OrderDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const t = useMessages();
  usePageMetadata({
    title: t.shop.orderDetailTitle,
    description: t.shop.orderDetailDescription,
  });

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [cancelMsg, setCancelMsg] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    api
      .get<OrderDetail>(`/v1/orders/${id}`)
      .then(setOrder)
      .catch(() => setError(t.shop.loadOrderFailed));
  }, [id, t]);

  useEffect(() => {
    if (!user) return;
    load();
    const close = connectWs({
      onEvent: (event) => {
        const payload = event.payload as { order_id?: number } | undefined;
        if (
          event.type.startsWith("order.") &&
          (!payload?.order_id || String(payload.order_id) === id)
        ) {
          load();
        }
        // Partner GPS updates arrive as partner.location_updated; refetch to
        // pick up the fresh position from REST (keeps the socket payload-free
        // on the customer side).
        if (event.type === "partner.location_updated") load();
      },
      onReconnect: load,
    });
    return close;
  }, [user, id, load]);

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <p className="text-muted-foreground">{t.shop.loginToOrders}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <p className="text-destructive">{error}</p>
        <Link to="/orders" className="mt-4 inline-block underline">
          {t.shop.backToOrders}
        </Link>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <p className="text-muted-foreground">{t.shop.loading}</p>
      </main>
    );
  }

  const cancellable = order.status === "placed" || order.status === "confirmed";
  const failed =
    order.status === "cancelled" || order.status === "delivery_failed";
  const flowIndex = TIMELINE_FLOW.indexOf(order.status);

  const cancelOrder = async () => {
    setCancelling(true);
    setCancelMsg("");
    try {
      await api.post(`/v1/orders/${id}/cancel`);
      load();
    } catch {
      setCancelMsg(t.shop.cancelFailed);
    } finally {
      setCancelling(false);
    }
  };

  const statusLabel = (s: string) =>
    (t.shop.status as Record<string, string>)[s] ?? s;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 md:px-10">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.shop.backToOrders}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-mono text-2xl text-foreground">{order.code}</h1>
        <p
          className={`text-lg font-medium ${
            failed
              ? "text-destructive"
              : order.status === "delivered"
                ? "text-primary"
                : ""
          }`}
        >
          {statusLabel(order.status)}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.shop.deliveryOn(order.delivery_date)} · {t.shop.cashOnDelivery} ·{" "}
        {formatPaise(order.total_paise)}
      </p>

      {/* Live tracking map */}
      {order.status === "out_for_delivery" && order.tracking && (
        <section className="mt-8 border border-black/10 p-5">
          <h2 className="flex items-center gap-2 text-lg font-medium text-foreground">
            <Bike className="h-5 w-5" />
            {t.shop.liveTracking}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.tracking.is_live
              ? t.shop.partnerNearby
              : t.shop.lastSeenMinutes(
                  Math.max(1, Math.round(order.tracking.age_seconds / 60))
                )}
            {order.partner?.name ? ` · ${order.partner.name}` : ""}
          </p>
          <div className="mt-4">
            <PointsMap
              points={[
                ...(order.address
                  ? []
                  : [
                      {
                        id: "home",
                        lat: 17.5358,
                        lng: 78.3855,
                        label: t.shop.yourLocation,
                        kind: "customer" as const,
                      },
                    ]),
                {
                  id: "partner",
                  lat: order.tracking.latitude,
                  lng: order.tracking.longitude,
                  label: t.shop.partnerLabel,
                  kind: "partner" as const,
                },
              ]}
              center={[order.tracking.latitude, order.tracking.longitude]}
              zoom={14}
            />
          </div>
        </section>
      )}

      {/* Timeline */}
      <section className="mt-8 border border-black/10 p-5">
        <h2 className="text-lg font-medium text-foreground">
          {t.shop.timeline}
        </h2>
        {failed ? (
          <div className="mt-4">
            <p className="text-sm text-destructive">
              {statusLabel(order.status)}
              {order.timeline.at(-1)?.note
                ? ` — ${order.timeline.at(-1)?.note}`
                : ""}
            </p>
          </div>
        ) : (
          <ol className="mt-4 space-y-3">
            {TIMELINE_FLOW.map((step, i) => {
              const done = flowIndex >= i;
              const current = flowIndex === i;
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 flex-none rounded-full ${
                      done ? "bg-primary" : "bg-black/15"
                    } ${current ? "ring-4 ring-primary/20" : ""}`}
                  />
                  <span
                    className={`text-sm ${done ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {statusLabel(step)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Items */}
      <section className="mt-8 border border-black/10 p-5">
        <h2 className="text-lg font-medium text-foreground">{t.shop.items}</h2>
        <ul className="mt-4 space-y-2">
          {order.items.map((item) => (
            <li key={item.variant_id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {item.name}
                {item.size_label ? ` · ${item.size_label}` : ""} ×{" "}
                {item.quantity}
              </span>
              <span>{formatPaise(item.total_price_paise)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-black/10 pt-4 font-medium">
          <span>{t.shop.total}</span>
          <span>{formatPaise(order.total_paise)}</span>
        </div>
      </section>

      {/* Address */}
      <section className="mt-8 border border-black/10 p-5">
        <h2 className="text-lg font-medium text-foreground">
          {t.shop.deliveryAddress}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {order.address.address_line}
          {order.address.landmark ? ` · ${order.address.landmark}` : ""}
          {order.address.instructions ? (
            <span className="mt-1 block italic">
              {order.address.instructions}
            </span>
          ) : null}
        </p>
      </section>

      {cancellable && (
        <div className="mt-6">
          <Button
            variant="outline"
            onClick={cancelOrder}
            disabled={cancelling}
            className="rounded-sm border border-black/15 px-6 py-3 text-destructive hover:bg-destructive hover:text-white"
          >
            {cancelling ? t.shop.cancelling : t.shop.cancelOrder}
          </Button>
          {cancelMsg && (
            <p className="mt-2 text-sm text-destructive">{cancelMsg}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {t.shop.cancelNote}
          </p>
        </div>
      )}
    </main>
  );
}
