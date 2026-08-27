import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { api, ApiError, type Address } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useMessages } from "../../i18n";

/**
 * Blocking profile-completion gate.
 *
 * A customer who verified OTP but never finished the details form (name +
 * one address) gets this overlay on every page. It cannot be dismissed —
 * only submitting the form clears it — but the navbar (hamburger + side
 * menu) sits above the overlay (z-50 vs z-40), so navigation stays
 * available while incomplete.
 *
 * The form is deliberately minimal: name, one address textarea, and an
 * automatic GPS capture (lat/lng/accuracy stored on the address).
 */
export function ProfileGate() {
  const { user, refresh } = useAuth();
  const t = useMessages();

  const [name, setName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [gps, setGps] = useState<{
    latitude: number;
    longitude: number;
    accuracy_m?: number;
  } | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "denied">(
    "idle"
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Seed from the session user; auto-capture location when the gate opens.
  useEffect(() => {
    if (!user) return;
    setName(user.name && user.name !== "Guest" ? user.name : "");
    setShowForm(true);
    setGpsState("locating");
    if (!("geolocation" in navigator)) {
      setGpsState("denied");
      return;
    }
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [user]);

  if (!user || user.profileComplete || !showForm) return null;

  const needsName = !name.trim() || name.trim() === "Guest";
  const canSubmit = !needsName && addressLine.trim().length > 3 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const trimmed = name.trim();
      // Persist whenever the typed name is valid and differs from what the
      // account already carries (covers replacing the Guest placeholder).
      if (trimmed && trimmed !== "Guest" && trimmed !== user.name) {
        await api.patch("/v1/customers/me", { name: trimmed });
      }
      const existing = await api
        .get<{ addresses: Address[] }>("/v1/customers/me/addresses")
        .then((res) => res.addresses)
        .catch(() => [] as Address[]);
      if (existing.length === 0) {
        await api.post("/v1/customers/me/addresses", {
          address_line: addressLine.trim(),
          latitude: gps?.latitude,
          longitude: gps?.longitude,
          accuracy_m: gps?.accuracy_m,
          is_default: true,
        });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.profile.saveFailed);
      setBusy(false);
    }
  };

  const recapture = () => {
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-background/95 px-6 pt-24 pb-10 backdrop-blur-sm md:pt-32"
      role="dialog"
      aria-modal="true"
      aria-label={t.profile.gateTitle}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md border border-black/15 bg-background p-6 shadow-lg md:p-8"
      >
        <h2 className="text-lg font-medium text-foreground">
          {t.profile.gateTitle}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.profile.gateBody}
        </p>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {t.profile.fullName} *
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={100}
            required
            className="w-full border border-black/15 bg-background px-3.5 py-3 text-base outline-none focus:border-primary"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {t.profile.addressLabel} *
          </span>
          <textarea
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder={t.profile.addressPlaceholder}
            rows={3}
            maxLength={500}
            required
            className="w-full resize-none border border-black/15 bg-background px-3.5 py-3 text-base outline-none focus:border-primary"
          />
        </label>

        <div className="mt-3 flex items-center justify-between gap-3 border border-dashed border-black/20 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Crosshair
              className={`h-4 w-4 ${gps ? "text-primary" : "text-muted-foreground/50"}`}
            />
            {gpsState === "locating" && t.profile.locating}
            {gpsState === "denied" && t.profile.locationDenied}
            {gps && gpsState === "idle" && (
              <>
                {t.profile.locationCaptured}{" "}
                <span className="font-mono">
                  {gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}
                </span>
                {gps.accuracy_m ? ` (±${Math.round(gps.accuracy_m)}m)` : ""}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={recapture}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            {t.profile.recapture}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={!canSubmit}
          className="mt-6 w-full rounded-sm bg-primary py-3.5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? t.profile.saving : t.profile.gateSubmit}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t.profile.gateNote}
        </p>
      </form>
    </div>
  );
}
