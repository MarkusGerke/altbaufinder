import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  AUTH_TOKEN_KEY,
  authLogin,
  authMe,
  authRegister,
  deleteAccountApi,
  requestPasswordReset,
  updateAccountEmail,
  updateAccountPassword,
  type AuthUser,
} from '../services/authApi'

interface AuthContextValue {
  user: AuthUser | null
  score: number | null
  error: string | null
  clearError: () => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
  isLoggedIn: boolean
  requestPasswordReset: (email: string) => Promise<void>
  updateEmail: (currentPassword: string, newEmail: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  deleteAccount: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Ohne gesetzte Variable nutzt die App `/api` (Vite-Proxy) — trotzdem API aktiv. */
const API_ENABLED = (import.meta.env.VITE_API_URL ?? '/api').length > 0

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY)
    } catch {
      return null
    }
  })
  const [user, setUser] = useState<AuthUser | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshMe = useCallback(async () => {
    if (!API_ENABLED || !token) {
      setUser(null)
      setScore(null)
      return
    }
    setError(null)
    try {
      const me = await authMe(token)
      setUser(me.user)
      setScore(me.score)
    } catch (e) {
      setUser(null)
      setScore(null)
      setToken(null)
      try {
        localStorage.removeItem(AUTH_TOKEN_KEY)
      } catch {
        /* ignore */
      }
      setError(e instanceof Error ? e.message : 'Sitzung ungültig')
    }
  }, [token])

  useEffect(() => {
    if (token) void refreshMe()
    else {
      setUser(null)
      setScore(null)
    }
  }, [token, refreshMe])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const { token: t, user: u } = await authLogin(email, password)
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, t)
    } catch {
      /* ignore */
    }
    setToken(t)
    setUser(u)
    const me = await authMe(t)
    setScore(me.score)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    setError(null)
    const { token: t, user: u } = await authRegister(email, password)
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, t)
    } catch {
      /* ignore */
    }
    setToken(t)
    setUser(u)
    const me = await authMe(t)
    setScore(me.score)
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY)
    } catch {
      /* ignore */
    }
    setToken(null)
    setUser(null)
    setScore(null)
    setError(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const requestPasswordResetFn = useCallback(async (email: string) => {
    setError(null)
    await requestPasswordReset(email)
  }, [])

  const updateEmail = useCallback(
    async (currentPassword: string, newEmail: string) => {
      if (!token) throw new Error('Nicht angemeldet')
      setError(null)
      const u = await updateAccountEmail(token, currentPassword, newEmail)
      setUser(u)
    },
    [token]
  )

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!token) throw new Error('Nicht angemeldet')
      setError(null)
      await updateAccountPassword(token, currentPassword, newPassword)
    },
    [token]
  )

  const deleteAccount = useCallback(
    async (password: string) => {
      if (!token) throw new Error('Nicht angemeldet')
      setError(null)
      await deleteAccountApi(token, password)
      try {
        localStorage.removeItem(AUTH_TOKEN_KEY)
      } catch {
        /* ignore */
      }
      setToken(null)
      setUser(null)
      setScore(null)
    },
    [token]
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      score,
      error,
      clearError,
      login,
      register,
      logout,
      refreshMe,
      isLoggedIn: !!user && !!token,
      requestPasswordReset: requestPasswordResetFn,
      updateEmail,
      changePassword,
      deleteAccount,
    }),
    [
      user,
      score,
      error,
      clearError,
      login,
      register,
      logout,
      refreshMe,
      token,
      requestPasswordResetFn,
      updateEmail,
      changePassword,
      deleteAccount,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
