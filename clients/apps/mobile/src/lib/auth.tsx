import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import * as SecureStore from "expo-secure-store"
import { api, clearTokens, getTokens, saveTokens } from "./api"
import { stopTracking } from "./tracking"

type Partner = { partner_id: number; name: string; phone: string }

type AuthContextValue = {
  partner: Partner | null
  loading: boolean
  login: (phone: string) => Promise<void>
  verify: (code: string) => Promise<Partner>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const OTP_TOKEN_KEY = "ar_partner_otp_token"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTokens()
      .then(async (tokens) => {
        if (!tokens) return
        try {
          const me = await api.get<Partner>("/v1/partner/me")
          setPartner(me)
        } catch {
          await clearTokens()
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (phone: string) => {
    const digits = phone.replace(/\D/g, "").replace(/^91/, "")
    if (digits.length !== 10) throw new Error("Enter a valid 10-digit number")
    const res = await api.post<{ token: string }>("/v1/auth/partner/send-otp", {
      phone: `+91${digits}`,
    })
    await SecureStore.setItemAsync(OTP_TOKEN_KEY, res.token)
  }, [])

  const verify = useCallback(async (code: string) => {
    const token = await SecureStore.getItemAsync(OTP_TOKEN_KEY)
    if (!token) throw new Error("Request a code first")
    const res = await api.post<Partner & { access_token: string; refresh_token: string }>(
      "/v1/auth/partner/verify-otp",
      { token, code },
    )
    await saveTokens({ access: res.access_token, refresh: res.refresh_token })
    await SecureStore.deleteItemAsync(OTP_TOKEN_KEY)
    const me: Partner = {
      partner_id: res.partner_id,
      name: res.name,
      phone: res.phone,
    }
    setPartner(me)
    return me
  }, [])

  const logout = useCallback(async () => {
    const tokens = await getTokens()
    if (tokens) {
      await api
        .post("/v1/auth/logout", { refresh_token: tokens.refresh })
        .catch(() => undefined)
    }
    await stopTracking()
    await clearTokens()
    setPartner(null)
  }, [])

  return (
    <AuthContext.Provider value={{ partner, loading, login, verify, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
