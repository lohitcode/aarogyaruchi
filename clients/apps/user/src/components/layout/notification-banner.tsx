import { useEffect, useState } from "react";
import { BellOff, BellRing, X } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@aarogyaruchi/ui/components/alert";
import { Button } from "@aarogyaruchi/ui/components/button";
import { useAuth } from "../../lib/auth";
import {
  currentPermission,
  enablePush,
  reportPushState,
  subscribeQuietly,
  type PushState,
} from "../../lib/push";
import { useMessages } from "../../i18n";

/**
 * Site-wide nudge shown under the navbar while the customer is logged in and
 * this browser has not granted notification permission. Dismissing hides it
 * for the current visit only — every fresh app open re-checks the permission
 * until it is granted (or the browser is incapable of notifications, in
 * which case there is nothing to ask for).
 */
export function NotificationBanner() {
  const { user } = useAuth();
  const t = useMessages();
  // Evaluated only in the browser (effect below) so SSR markup and the first
  // client paint agree.
  const [permission, setPermission] = useState<PushState>("unsupported");
  const [dismissed, setDismissed] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!user) return;
    const state = currentPermission();
    setPermission(state);
    // Report on every app open so support can see this device's reachability.
    reportPushState();
    // Keep previously-granted devices subscribed (browsers drop
    // subscriptions); this used to happen only on the /support page.
    if (state === "granted") subscribeQuietly();

    // Permission can change outside our UI (browser site settings).
    const onFocus = () => {
      const next = currentPermission();
      setPermission((prev) => {
        if (prev !== next) reportPushState();
        return next;
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user]);

  const turnOn = async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      setPermission(await enablePush());
      reportPushState();
    } finally {
      setEnabling(false);
    }
  };

  if (!user || dismissed) return null;
  if (permission === "granted" || permission === "unsupported") return null;

  const blocked = permission === "denied";
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-3 md:px-10">
      <Alert>
        {blocked ? <BellOff /> : <BellRing />}
        <AlertTitle>
          {blocked ? t.notifications.blockedTitle : t.notifications.title}
        </AlertTitle>
        <div>
          <AlertDescription>
            {blocked ? t.notifications.blockedBody : t.notifications.body}
          </AlertDescription>
          {!blocked && (
            <Button
              size="sm"
              onClick={turnOn}
              disabled={enabling}
              className="mt-2 w-fit rounded-sm px-4"
            >
              {enabling ? t.notifications.enabling : t.notifications.enable}
            </Button>
          )}
        </div>
        <AlertAction>
          <button
            type="button"
            aria-label={t.notifications.dismiss}
            onClick={() => setDismissed(true)}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </AlertAction>
      </Alert>
    </div>
  );
}
