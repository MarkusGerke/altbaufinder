export const AUTH_TOKEN_KEY = 'altbaufinder-auth-token'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

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
  const data = (await res.json()) as { error?: string; token?: string; user?: AuthUser }
  if (!res.ok) throw new Error(data.error ?? `Registrierung fehlgeschlagen (${res.status})`)
  if (!data.token || !data.user) throw new Error('Ungültige Server-Antwort')
  return { token: data.token, user: data.user }
}

export async function authLogin(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = (await res.json()) as { error?: string; token?: string; user?: AuthUser }
  if (!res.ok) throw new Error(data.error ?? `Anmeldung fehlgeschlagen (${res.status})`)
  if (!data.token || !data.user) throw new Error('Ungültige Server-Antwort')
  return { token: data.token, user: data.user }
}

export async function authMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/auth/me.php`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = (await res.json()) as { error?: string; user?: AuthUser; score?: number }
  if (!res.ok) throw new Error(data.error ?? `Abfrage fehlgeschlagen (${res.status})`)
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
  const data = (await res.json()) as { leaderboard?: LeaderboardRow[]; error?: string }
  if (!res.ok) return []
  return data.leaderboard ?? []
}
