import { readJsonResponse } from '@/lib/readJsonResponse'

export const AUTH_TOKEN_KEY = 'altbaufinder-auth-token'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

type ApiErrorBody = { error?: string; detail?: string }

function throwAuthError(res: Response, data: ApiErrorBody, fallback: string): never {
  let msg = data.error ?? `${fallback} (${res.status})`
  if (import.meta.env.DEV && data.detail) {
    msg += `: ${data.detail}`
  }
  throw new Error(msg)
}

export interface AuthUser {
  id: number
  email: string
}

export interface MeResponse {
  user: AuthUser
  score: number
}

export async function authRegister(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/register.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; token?: string; user?: AuthUser }>(
    res
  )
  if (!res.ok) throwAuthError(res, data, 'Registrierung fehlgeschlagen')
  if (!data.token || !data.user) throw new Error('Ungültige Server-Antwort')
  return { token: data.token, user: data.user }
}

export async function authLogin(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; token?: string; user?: AuthUser }>(res)
  if (!res.ok) throwAuthError(res, data, 'Anmeldung fehlgeschlagen')
  if (!data.token || !data.user) throw new Error('Ungültige Server-Antwort')
  return { token: data.token, user: data.user }
}

export async function authMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/auth/me.php`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; user?: AuthUser; score?: number }>(res)
  if (!res.ok) throwAuthError(res, data, 'Abfrage fehlgeschlagen')
  if (!data.user || data.score === undefined) throw new Error('Ungültige Server-Antwort')
  return { user: data.user, score: data.score }
}

export interface LeaderboardRow {
  rank: number
  score: number
  emailMasked: string
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const res = await fetch(`${API_BASE}/leaderboard.php`)
  const data = await readJsonResponse<{ leaderboard?: LeaderboardRow[]; error?: string }>(res)
  if (!res.ok) return []
  return data.leaderboard ?? []
}
