import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { api, ApiError } from "../lib/api"
import { fetchAdminSession } from "../lib/admin"

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AdminLogin,
})

function AdminLogin() {
  const [digits, setDigits] = useState("")
  const [otp, setOtp] = useState("")
  const [token, setToken] = useState("")
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (digits.length !== 10 || busy) return
    setBusy(true)
    setError("")
    try {
      const res = await api.post<{ token: string }>("/v1/auth/admin/send-otp", {
        phone: `+91${digits}`,
      })
      setToken(res.token)
      setStep("otp")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send code")
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6 || busy) return
    setBusy(true)
    setError("")
    try {
      await api.post("/v1/auth/admin/verify-otp", { token, code: otp })
      const session = await fetchAdminSession()
      if (!session) {
        setError("This number is not a provisioned admin account.")
        return
      }
      navigate({ to: "/dashboard", replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <form
        onSubmit={step === "phone" ? send : verify}
        className="w-full max-w-sm border border-neutral-200 bg-white p-8"
      >
        <p className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
          Aarogya Ruchi
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">Operations sign in</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {step === "phone"
            ? "Sign in with a provisioned admin phone number."
            : `Enter the code sent to +91 ${digits}.`}
        </p>

        {step === "phone" ? (
          <div className="mt-6 flex items-stretch border border-neutral-300">
            <span className="flex items-center border-r border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-600">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={digits}
              onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").replace(/^91/, "").slice(0, 10))}
              className="w-full px-3 py-2.5 text-base tracking-wide outline-none"
              placeholder="Admin phone"
              aria-label="Admin phone number"
              required
            />
          </div>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-6 w-full border border-neutral-300 px-3 py-2.5 text-center text-xl tracking-[0.4em] outline-none"
            placeholder="——————"
            aria-label="One-time code"
            required
          />
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || (step === "phone" ? digits.length !== 10 : otp.length !== 6)}
          className="mt-4 w-full bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {busy ? "Working…" : step === "phone" ? "Send code" : "Verify"}
        </button>

        {step === "otp" && (
          <button
            type="button"
            onClick={() => {
              setStep("phone")
              setOtp("")
              setError("")
            }}
            className="mt-3 w-full text-sm text-neutral-500 hover:text-neutral-800"
          >
            Change number
          </button>
        )}
      </form>
    </div>
  )
}
