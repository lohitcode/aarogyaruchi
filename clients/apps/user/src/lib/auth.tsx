import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { api } from "./api"
import { LoginDialog } from "../components/auth/login-dialog"

type SessionUser = {
  id: number
  phone: string
  name: string
  profileComplete: boolean
}

type AuthContextValue = {
  user: SessionUser | null
  /** True until the bootstrap session check resolves. */
  loading: boolean
  login: (user: SessionUser) => void
  logout: () => void
  /** Re-read the session (e.g. after completing the profile). */
  refresh: () => Promise<void>
  /** Run `next` if logged in, otherwise open the login modal and run it after login. */
  requireAuth: (next: () => void) => void
  loginOpen: boolean
  openLogin: () => void
  closeLogin: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

type SessionResponse = {
  authenticated: boolean
  type?: string
  user?: { id: number; phone: string; name: string; profile_complete?: boolean }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loginOpen, setLoginOpen] = useState(false)
  const [pendingNext, setPendingNext] = useState<(() => void) | null>(null)

  // Bootstrap from the server session cookie on first load.
  useEffect(() => {
    let cancelled = false
    api
      .get<SessionResponse>("/v1/auth/session")
      .then((res) => {
        if (cancelled) return
        if (res.authenticated && res.user) {
          setUser({
            id: res.user.id,
            phone: res.user.phone,
            name: res.user.name,
            profileComplete: res.user.profile_complete ?? false,
          })
        }
      })
      .catch(() => {
        // Network/API failure: stay logged out; pages surface errors on use.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<SessionResponse>("/v1/auth/session")
      if (res.authenticated && res.user) {
        setUser({
          id: res.user.id,
          phone: res.user.phone,
          name: res.user.name,
          profileComplete: res.user.profile_complete ?? false,
        })
      }
    } catch {
      return undefined // keep current state on failure
    }
  }, [])

  const login = useCallback((loggedIn: SessionUser) => {
    setUser(loggedIn)
    setLoginOpen(false)
  }, [])

  const logout = useCallback(() => {
    api.post("/v1/auth/logout").catch(() => {})
    setUser(null)
  }, [])

  const requireAuth = useCallback(
    (next: () => void) => {
      if (user) {
        next()
      } else {
        setPendingNext(() => next)
        setLoginOpen(true)
      }
    },
    [user],
  )

  const closeLogin = useCallback(() => {
    setLoginOpen(false)
    setPendingNext(null)
  }, [])

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    refresh,
    requireAuth,
    loginOpen,
    openLogin: () => setLoginOpen(true),
    closeLogin,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
      <LoginDialog
        open={loginOpen}
        onClose={closeLogin}
        onLogin={(session) => {
          login(session)
          const next = pendingNext
          setPendingNext(null)
          next?.()
        }}
      />
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
