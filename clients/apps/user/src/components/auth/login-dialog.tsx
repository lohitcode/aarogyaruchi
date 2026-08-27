import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@aarogyaruchi/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aarogyaruchi/ui/components/dialog";
import { Input } from "@aarogyaruchi/ui/components/input";
import { api, ApiError } from "../../lib/api";
import { useMessages } from "../../i18n";

type LoginDialogProps = {
  open: boolean;
  onClose: () => void;
  onLogin: (user: {
    id: number;
    phone: string;
    name: string;
    profileComplete: boolean;
  }) => void;
};

/** Keep only the 10-digit Indian mobile number (strip any leading 91 / non-digits). */
function toTenDigits(value: string) {
  return value.replace(/\D/g, "").replace(/^91/, "").slice(0, 10);
}

/**
 * Real OTP login against /v1/auth/customer/*. New phones register with a
 * name; the fixed staging OTP (123456) is only ever shown when the API says
 * so via an explicit hint — never trusted client-side.
 */
export function LoginDialog({ open, onClose, onLogin }: LoginDialogProps) {
  const [step, setStep] = useState<"phone" | "otp" | "profile">("phone");
  const [digits, setDigits] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpToken, setOtpToken] = useState("");
  const [newUser, setNewUser] = useState(false);
  const t = useMessages();

  // Reset the form shortly after the dialog closes (after the exit animation).
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => {
      setStep("phone");
      setDigits("");
      setOtp("");
      setName("");
      setError("");
      setOtpToken("");
      setNewUser(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [open]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (digits.length !== 10 || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.post<{ token: string; expires_in: number }>(
        "/v1/auth/customer/send-otp",
        { phone: `+91${digits}` }
      );
      setOtpToken(res.token);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.sendFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6 || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.post<{
        is_new: boolean;
        user_id: number;
        phone: string;
        name: string;
        profile_complete: boolean;
      }>("/v1/auth/customer/verify-otp", {
        token: otpToken,
        code: otp,
        name: newUser ? name.trim() : undefined,
      });
      if (res.is_new && !name.trim()) {
        // Server registered with a placeholder name — collect it now.
        setNewUser(true);
        setStep("profile");
        return;
      }
      onLogin({
        id: res.user_id,
        phone: res.phone,
        name: res.name,
        profileComplete: res.profile_complete ?? false,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.verifyFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setError("");
    setBusy(true);
    try {
      await api.patch("/v1/customers/me", { name: name.trim() });
      onLogin({
        id: 0,
        phone: `+91${digits}`,
        name: name.trim(),
        profileComplete: false,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.verifyFailed);
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === "phone"
      ? t.auth.phoneTitle
      : step === "otp"
        ? t.auth.otpTitle
        : t.auth.profileTitle;

  const description =
    step === "phone"
      ? t.auth.phoneDescription
      : step === "otp"
        ? t.auth.otpDescription(digits)
        : t.auth.profileDescription;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-login-dialog className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {step === "phone" && (
            <motion.form
              key="phone"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSendOtp}
              className="space-y-4"
            >
              <div className="flex items-stretch border border-black/15">
                <span className="flex items-center border-r border-black/15 bg-secondary px-3 text-sm font-medium text-foreground">
                  +91
                </span>
                <Input
                  id="login-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder={t.auth.phonePlaceholder}
                  value={digits}
                  onChange={(e) => setDigits(toTenDigits(e.target.value))}
                  className="rounded-none border-0 px-3 py-3 text-base tracking-wide focus-visible:ring-0"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={digits.length !== 10 || busy}
                className="w-full rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {busy ? t.auth.sending : t.auth.continueToCode}
              </Button>
              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}
              <p className="text-center text-xs text-muted-foreground">
                {t.auth.previewNote}
              </p>
            </motion.form>
          )}

          {step === "otp" && (
            <motion.form
              key="otp"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleVerify}
              className="space-y-4"
            >
              <Input
                id="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="------"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="rounded-sm border border-black/15 px-3 py-3 text-center text-2xl tracking-[0.5em] focus-visible:ring-0"
                required
              />

              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                disabled={otp.length !== 6 || busy}
                className="w-full rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {busy ? t.auth.verifying : t.auth.verify}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError("");
                }}
                className="w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.auth.changeNumber}
              </button>
            </motion.form>
          )}

          {step === "profile" && (
            <motion.form
              key="profile"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleCompleteProfile}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label
                  htmlFor="login-name"
                  className="text-sm font-medium text-foreground"
                >
                  {t.auth.fullName}
                </label>
                <Input
                  id="login-name"
                  type="text"
                  autoComplete="name"
                  placeholder={t.auth.namePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-sm border border-black/15 px-3 py-3 text-base focus-visible:ring-0"
                  required
                />
              </div>

              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                disabled={!name.trim() || busy}
                className="w-full rounded-sm bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {t.auth.completeSignup}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>

        {step !== "otp" && (
          <p className="text-center text-xs text-muted-foreground">
            {t.auth.legalNote.lead}{" "}
            <a className="underline" href="/terms-of-service">
              {t.auth.legalNote.terms}
            </a>{" "}
            {t.auth.legalNote.and}{" "}
            <a className="underline" href="/privacy">
              {t.auth.legalNote.privacy}
            </a>
            {t.auth.legalNote.trailing}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
