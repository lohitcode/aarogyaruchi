import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Crosshair, Pencil } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { api, ApiError, type Address, type OrderSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useMessages, usePageMetadata } from "../i18n";
import PointsMap from "../components/map/points-map";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — Aarogya Ruchi" },
      {
        name: "description",
        content: "Your account details and delivery address.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, refresh } = useAuth();
  const t = useMessages();
  usePageMetadata({
    title: t.profile.title,
    description: t.profile.description,
  });

  const [name, setName] = useState(user?.name ?? "");
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingAddress, setEditingAddress] = useState<number | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  const [gps, setGps] = useState<{
    latitude: number;
    longitude: number;
    accuracy_m?: number;
  } | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "denied">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get<{ addresses: Address[] }>("/v1/customers/me/addresses")
      .then((res) => setAddresses(res.addresses))
      .catch(() => setAddresses([]));
    api
      .get<{ orders: OrderSummary[] }>("/v1/orders?limit=100")
      .then((res) => setOrderCount(res.orders.length))
      .catch(() => setOrderCount(null));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError("");
    try {
      await api.patch("/v1/customers/me", { name: trimmed });
      await refresh();
      setEditingName(false);
      setMessage(t.profile.saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.saveFailed);
    }
  };

  const startEditAddress = (addr: Address) => {
    setEditingAddress(addr.id);
    setAddressDraft(addr.address_line);
    setGps(
      addr.latitude != null && addr.longitude != null
        ? {
            latitude: addr.latitude,
            longitude: addr.longitude,
            accuracy_m: addr.accuracy_m,
          }
        : null
    );
    setGpsState("idle");
    setMessage("");
  };

  const captureGps = (fresh: boolean) => {
    setGpsState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        });
        setGpsState("idle");
      },
      () => setGpsState("denied"),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: fresh ? 0 : 30000,
      }
    );
  };

  const saveAddress = async (addr: Address) => {
    const trimmed = addressDraft.trim();
    if (trimmed.length < 4) return;
    setError("");
    try {
      await api.patch(`/v1/customers/me/addresses/${addr.id}`, {
        address_line: trimmed,
        label: addr.label ?? undefined,
        landmark: addr.landmark ?? undefined,
        locality_id: addr.locality_id ?? undefined,
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        accuracy_m: gps?.accuracy_m,
        is_default: addr.is_default,
      });
      setEditingAddress(null);
      load();
      setMessage(t.profile.saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.saveFailed);
    }
  };

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center md:px-10">
        <p className="text-muted-foreground">{t.profile.loginFirst}</p>
      </main>
    );
  }

  const defaultAddress = addresses?.find((a) => a.is_default) ?? addresses?.[0];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 md:px-10">
      <h1 className="text-foreground">{t.profile.title}</h1>
      {message && <p className="mt-2 text-sm text-primary">{message}</p>}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {/* Identity */}
      <section className="mt-8 border border-black/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {t.profile.phone}
            </p>
            <p className="mt-1 font-mono text-lg font-medium text-foreground">
              {user.phone}
            </p>
          </div>
          {orderCount !== null && (
            <div className="text-right">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                {t.profile.ordersPlaced}
              </p>
              <p className="mt-1 text-lg font-medium text-foreground">
                {orderCount}
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-black/10 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                {t.profile.fullName}
              </p>
              {editingName ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    className="flex-1 border border-black/15 bg-background px-3 py-2 text-base outline-none focus:border-primary"
                    aria-label={t.profile.fullName}
                  />
                  <Button
                    onClick={saveName}
                    className="rounded-sm bg-primary px-4 text-primary-foreground"
                    disabled={!name.trim()}
                  >
                    {t.profile.save}
                  </Button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-lg font-medium text-foreground">
                    {user.name || "—"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    aria-label={t.profile.editName}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Address + location */}
      <section className="mt-6 border border-black/10 p-5">
        <h2 className="text-lg font-medium text-foreground">
          {t.profile.deliveryAddress}
        </h2>

        {addresses === null ? (
          <p className="mt-4 text-sm text-muted-foreground">{t.shop.loading}</p>
        ) : addresses.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t.profile.noAddress}
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {addresses.map((addr) => (
              <li
                key={addr.id}
                className="border-t border-black/10 pt-4 first:border-0 first:pt-0"
              >
                {editingAddress === addr.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={addressDraft}
                      onChange={(e) => setAddressDraft(e.target.value)}
                      rows={3}
                      maxLength={500}
                      className="w-full resize-none border border-black/15 bg-background px-3.5 py-3 text-base outline-none focus:border-primary"
                      aria-label={t.profile.addressLabel}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-black/20 px-3.5 py-2.5">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Crosshair
                          className={`h-4 w-4 ${gps ? "text-primary" : "text-muted-foreground/50"}`}
                        />
                        {gpsState === "locating" && t.profile.locating}
                        {gpsState === "denied" && t.profile.locationDenied}
                        {gps && gpsState === "idle" && (
                          <span className="font-mono">
                            {gps.latitude.toFixed(5)},{" "}
                            {gps.longitude.toFixed(5)}
                            {gps.accuracy_m
                              ? ` (±${Math.round(gps.accuracy_m)}m)`
                              : ""}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => captureGps(true)}
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        {t.profile.recapture}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => saveAddress(addr)}
                        disabled={addressDraft.trim().length < 4}
                        className="rounded-sm bg-primary px-4 text-primary-foreground"
                      >
                        {t.profile.save}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingAddress(null)}
                        className="rounded-sm border border-black/15 px-4"
                      >
                        {t.shop.cancel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-foreground">
                        {addr.address_line}
                      </p>
                      {addr.landmark ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {addr.landmark}
                        </p>
                      ) : null}
                      {addr.latitude != null && addr.longitude != null ? (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {addr.latitude.toFixed(5)},{" "}
                          {addr.longitude.toFixed(5)}
                          {addr.accuracy_m
                            ? ` (±${Math.round(addr.accuracy_m)}m)`
                            : ""}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.profile.noLocation}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => startEditAddress(addr)}
                      aria-label={t.profile.editAddress}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {defaultAddress?.latitude != null &&
          defaultAddress?.longitude != null &&
          editingAddress === null && (
            <div className="mt-5">
              <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
                {t.profile.locationOnMap}
              </p>
              <PointsMap
                points={[
                  {
                    id: "home",
                    lat: defaultAddress.latitude,
                    lng: defaultAddress.longitude,
                    label: t.shop.yourLocation,
                    kind: "customer",
                  },
                ]}
                center={[defaultAddress.latitude, defaultAddress.longitude]}
                zoom={16}
                height={240}
              />
            </div>
          )}
      </section>

      {orderCount !== null && orderCount > 0 && addresses !== null && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t.profile.ordersNote(orderCount)}
        </p>
      )}
    </main>
  );
}
