import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Crosshair, MapPin, Plus } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { Input } from "@aarogyaruchi/ui/components/input";
import {
  api,
  ApiError,
  formatPaise,
  type Address,
  type Locality,
  type Quote,
} from "../lib/api";
import { useCart } from "../lib/cart";
import { useAuth } from "../lib/auth";
import { useMessages, usePageMetadata } from "../i18n";
import PointsMap from "../components/map/points-map";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Aarogya Ruchi" },
      {
        name: "description",
        content: "Confirm your address and place your order.",
      },
    ],
  }),
  component: CheckoutPage,
});

type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy_m?: number;
};

function CheckoutPage() {
  const { lines, totalPaise, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useMessages();
  usePageMetadata({
    title: t.shop.checkoutTitle,
    description: t.shop.checkoutDescription,
  });

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  // New-address form
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [landmark, setLandmark] = useState("");
  const [localityId, setLocalityId] = useState(0);
  const [autoLocality, setAutoLocality] = useState("");
  const [instructions, setInstructions] = useState("");
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "denied">(
    "idle"
  );
  const [confirmedOnMap, setConfirmedOnMap] = useState(false);

  const loadAddresses = useCallback(() => {
    api
      .get<{ addresses: Address[] }>("/v1/customers/me/addresses")
      .then((res) => {
        setAddresses(res.addresses);
        setSelectedId((prev) => {
          if (prev) return prev;
          return (
            res.addresses.find((a) => a.is_default)?.id ??
            res.addresses[0]?.id ??
            null
          );
        });
      })
      .catch(() => setError(t.shop.loadAddressesFailed));
  }, [t]);

  useEffect(() => {
    if (!user) return;
    loadAddresses();
    api
      .get<{ localities: Locality[] }>("/v1/localities")
      .then((res) => setLocalities(res.localities))
      .catch(() => {});
  }, [user, loadAddresses]);

  const selected = useMemo(
    () => addresses.find((a) => a.id === selectedId) ?? null,
    [addresses, selectedId]
  );

  // Quote whenever the cart or selection changes.
  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      return;
    }
    api
      .post<Quote>("/v1/orders/quote", {
        items: lines.map((l) => ({
          variant_id: l.variant_id,
          quantity: l.quantity,
        })),
        locality_id: selected?.locality_id ?? 0,
      })
      .then(setQuote)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t.shop.quoteFailed);
      });
  }, [lines, selected, t]);

  const captureGps = () => {
    if (!("geolocation" in navigator)) {
      setGpsState("denied");
      return;
    }
    setGpsState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        };
        setGps(fix);
        setGpsState("idle");
        // Auto-assign the delivery locality from the drawn perimeters; the
        // dropdown above stays a manual override.
        if (localityId === 0) {
          api
            .get<{ locality: Locality | null }>(
              `/v1/localities/resolve?lat=${fix.latitude}&lng=${fix.longitude}`
            )
            .then((res) => {
              if (res.locality) {
                setLocalityId(res.locality.id);
                setAutoLocality(res.locality.name);
              }
            })
            .catch(() => {});
        }
      },
      () => setGpsState("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const canSaveNew =
    addressLine.trim().length > 3 &&
    localityId > 0 &&
    // GPS or explicitly confirmed typed location is required before ordering.
    (gps !== null || confirmedOnMap);

  const saveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSaveNew) return;
    setError("");
    try {
      const res = await api.post<{ id: number }>("/v1/customers/me/addresses", {
        label: label.trim() || undefined,
        address_line: addressLine.trim(),
        landmark: landmark.trim() || undefined,
        locality_id: localityId,
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        accuracy_m: gps?.accuracy_m,
        instructions: instructions.trim() || undefined,
        is_default: addresses.length === 0,
      });
      setAdding(false);
      setLabel("");
      setAddressLine("");
      setLandmark("");
      setInstructions("");
      setLocalityId(0);
      setGps(null);
      setConfirmedOnMap(false);
      loadAddresses();
      setSelectedId(res.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t.shop.saveAddressFailed
      );
    }
  };

  const placeOrder = async () => {
    if (!selected || placing) return;
    setPlacing(true);
    setError("");
    try {
      const res = await api.post<{ order_id: number; code: string }>(
        "/v1/orders",
        {
          address_id: selected.id,
          items: lines.map((l) => ({
            variant_id: l.variant_id,
            quantity: l.quantity,
          })),
        },
        // Fresh key per submission attempt; replays are safe on retry of the
        // same in-flight request only when the key is stable per order intent.
        { idempotencyKey: crypto.randomUUID() }
      );
      clear();
      navigate({ to: "/order-success", search: { code: res.code } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.shop.placeOrderFailed);
      setPlacing(false);
    }
  };

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <p className="text-muted-foreground">{t.shop.loginToCheckout}</p>
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <p className="text-muted-foreground">{t.shop.emptyCart}</p>
        <Button
          onClick={() => navigate({ to: "/products" })}
          className="mt-6 rounded-sm bg-primary px-6 py-3 text-primary-foreground"
        >
          {t.shop.browseProducts}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 md:px-10">
      <h1 className="text-foreground">{t.shop.checkoutTitle}</h1>

      {/* Address selection */}
      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">
          {t.shop.deliveryAddress}
        </h2>
        <div className="mt-4 grid gap-3">
          {addresses.map((addr) => (
            <button
              key={addr.id}
              type="button"
              onClick={() => setSelectedId(addr.id)}
              className={`flex items-start gap-3 border p-4 text-left transition-colors ${
                selectedId === addr.id
                  ? "border-primary bg-primary/5"
                  : "border-black/15 hover:border-black/30"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border ${
                  selectedId === addr.id
                    ? "border-primary bg-primary text-white"
                    : "border-black/30"
                }`}
              >
                {selectedId === addr.id ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {addr.label ? <>{addr.label} · </> : null}
                  {addr.address_line}
                </span>
                {addr.landmark ? (
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {t.shop.landmark}: {addr.landmark}
                  </span>
                ) : null}
                {addr.latitude != null ? (
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Crosshair className="h-3 w-3" /> GPS
                  </span>
                ) : null}
              </span>
            </button>
          ))}

          {adding ? (
            <form
              onSubmit={saveAddress}
              className="space-y-4 border border-black/15 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="addr-label" className="text-sm font-medium">
                    {t.shop.addressLabel}
                  </label>
                  <Input
                    id="addr-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t.shop.addressLabelHint}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label
                    htmlFor="addr-locality"
                    className="text-sm font-medium"
                  >
                    {t.shop.locality} *
                  </label>
                  <select
                    id="addr-locality"
                    value={localityId}
                    onChange={(e) => {
                      setLocalityId(Number(e.target.value));
                      setAutoLocality("");
                    }}
                    className="mt-1 h-10 w-full rounded-sm border border-black/15 bg-background px-3 text-sm"
                    required
                  >
                    <option value={0}>{t.shop.selectLocality}</option>
                    {localities.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  {autoLocality && localityId > 0 && (
                    <p className="mt-1 text-xs text-neutral-500">
                      Auto-detected from your location: {autoLocality}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="addr-line" className="text-sm font-medium">
                  {t.shop.addressLine} *
                </label>
                <Input
                  id="addr-line"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder={t.shop.addressLineHint}
                  className="mt-1"
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="addr-landmark"
                    className="text-sm font-medium"
                  >
                    {t.shop.landmark}
                  </label>
                  <Input
                    id="addr-landmark"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label
                    htmlFor="addr-instructions"
                    className="text-sm font-medium"
                  >
                    {t.shop.instructions}
                  </label>
                  <Input
                    id="addr-instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* GPS + map confirm */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={captureGps}
                    disabled={gpsState === "locating"}
                    className="rounded-sm border border-black/15 py-2"
                  >
                    <Crosshair className="mr-2 h-4 w-4" />
                    {gpsState === "locating"
                      ? t.shop.locating
                      : t.shop.useMyLocation}
                  </Button>
                  {gps && (
                    <span className="text-xs text-muted-foreground">
                      ±{Math.round(gps.accuracy_m ?? 0)}m ·{" "}
                      {gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}
                    </span>
                  )}
                  {gpsState === "denied" && (
                    <span className="text-xs text-destructive">
                      {t.shop.gpsDenied}
                    </span>
                  )}
                </div>

                {gps && (
                  <PointsMap
                    points={[
                      {
                        id: "new",
                        lat: gps.latitude,
                        lng: gps.longitude,
                        label: t.shop.yourLocation,
                        kind: "customer",
                      },
                    ]}
                    center={[gps.latitude, gps.longitude]}
                    zoom={16}
                    height={240}
                  />
                )}

                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmedOnMap}
                    onChange={(e) => setConfirmedOnMap(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground">
                    {t.shop.confirmLocation}
                  </span>
                </label>
              </div>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={!canSaveNew}
                  className="rounded-sm bg-primary px-6 py-3 text-primary-foreground"
                >
                  {t.shop.saveAddress}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdding(false)}
                  className="rounded-sm border border-black/15 px-6 py-3"
                >
                  {t.shop.cancel}
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 border border-dashed border-black/25 p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              {t.shop.addAddress}
            </button>
          )}
        </div>
      </section>

      {/* Order summary */}
      <section className="mt-10 border border-black/10 p-5">
        <h2 className="text-lg font-medium text-foreground">
          {t.shop.orderSummary}
        </h2>
        <ul className="mt-4 space-y-2">
          {lines.map((l) => (
            <li key={l.variant_id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {l.name}
                {l.size_label ? ` · ${l.size_label}` : ""} × {l.quantity}
              </span>
              <span>{formatPaise(l.price_paise * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-black/10 pt-4 text-base font-medium">
          <span>{t.shop.total}</span>
          <span>{formatPaise(quote?.total_paise ?? totalPaise)}</span>
        </div>
        {quote && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {t.shop.deliveryOn(quote.delivery_date)} · {t.shop.cashOnDelivery}
          </p>
        )}
      </section>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <Button
        onClick={placeOrder}
        disabled={!selected || placing}
        className="mt-6 w-full rounded-sm bg-primary py-4 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        {placing ? t.shop.placing : t.shop.placeCodOrder}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {t.shop.finalTotalNote}
      </p>
    </main>
  );
}
