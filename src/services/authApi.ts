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
  displayName: string
  /** Gesetzt nach /auth/me.php – Foto-Moderation. */
  isPhotoModerator?: boolean
  /** false = wartet auf Freigabe für Gebäudefoto-Upload (fehlendes Feld = true für ältere API). */
  canUploadPhotos: boolean
  isAccountApprover?: boolean
}

function parseAuthUser(raw: {
  id: number
  email: string
  displayName?: string | null
  isPhotoModerator?: boolean
  canUploadPhotos?: boolean
  isAccountApprover?: boolean
}): AuthUser {
  const dn =
    raw.displayName != null && String(raw.displayName).trim() !== ''
      ? String(raw.displayName).trim()
      : (raw.email.split('@')[0] || 'Nutzer')
  return {
    id: raw.id,
    email: raw.email,
    displayName: dn,
    canUploadPhotos: raw.canUploadPhotos !== false,
    ...(raw.isPhotoModerator === true ? { isPhotoModerator: true } : {}),
    ...(raw.isAccountApprover === true ? { isAccountApprover: true } : {}),
  }
}

export interface MeResponse {
  user: AuthUser
  score: number
}

export async function authRegister(
  email: string,
  password: string,
  displayName?: string,
  turnstileToken?: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/register.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(displayName != null && displayName.trim() !== ''
        ? { displayName: displayName.trim() }
        : {}),
      ...(turnstileToken != null && turnstileToken !== ''
        ? { turnstileToken }
        : {}),
    }),
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; token?: string; user?: AuthUser }>(
    res
  )
  if (!res.ok) throwAuthError(res, data, 'Registrierung fehlgeschlagen')
  if (!data.token || !data.user) throw new Error('Ungültige Server-Antwort')
  return { token: data.token, user: parseAuthUser(data.user) }
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
  return { token: data.token, user: parseAuthUser(data.user) }
}

export async function authMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/auth/me.php`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; user?: AuthUser; score?: number }>(res)
  if (!res.ok) throwAuthError(res, data, 'Abfrage fehlgeschlagen')
  if (!data.user || data.score === undefined) throw new Error('Ungültige Server-Antwort')
  return { user: parseAuthUser(data.user), score: data.score }
}

export interface LeaderboardRow {
  rank: number
  score: number
  displayName: string
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const res = await fetch(`${API_BASE}/leaderboard.php`)
  const data = await readJsonResponse<{ leaderboard?: LeaderboardRow[]; error?: string }>(res)
  if (!res.ok) return []
  return data.leaderboard ?? []
}

function jsonAuthHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

/** Passwort vergessen — immer neutrale Server-Antwort bei Erfolg. */
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/password-request-reset.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await readJsonResponse<{ ok?: boolean; message?: string; error?: string; detail?: string }>(res)
  if (!res.ok) throwAuthError(res, data, 'Anfrage fehlgeschlagen')
}

export async function completePasswordReset(resetToken: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/password-reset.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password }),
  })
  const data = await readJsonResponse<{ ok?: boolean; message?: string; error?: string; detail?: string }>(res)
  if (!res.ok) throwAuthError(res, data, 'Passwort konnte nicht gesetzt werden')
}

export async function updateAccountDisplayName(token: string, displayName: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/auth/account-update-display-name.php`, {
    method: 'POST',
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ displayName }),
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; user?: AuthUser }>(res)
  if (!res.ok) throwAuthError(res, data, 'Anzeigename konnte nicht geändert werden')
  if (!data.user) throw new Error('Ungültige Server-Antwort')
  return parseAuthUser(data.user)
}

export async function updateAccountEmail(
  token: string,
  currentPassword: string,
  newEmail: string
): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/auth/account-update-email.php`, {
    method: 'POST',
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ currentPassword, newEmail }),
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; user?: AuthUser }>(res)
  if (!res.ok) throwAuthError(res, data, 'E-Mail konnte nicht geändert werden')
  if (!data.user) throw new Error('Ungültige Server-Antwort')
  return parseAuthUser(data.user)
}

export async function updateAccountPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/account-update-password.php`, {
    method: 'POST',
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; ok?: boolean }>(res)
  if (!res.ok) throwAuthError(res, data, 'Passwort konnte nicht geändert werden')
}

export async function deleteAccountApi(token: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/account-delete.php`, {
    method: 'POST',
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ password }),
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; ok?: boolean }>(res)
  if (!res.ok) throwAuthError(res, data, 'Konto konnte nicht gelöscht werden')
}

export interface PendingUploadUser {
  id: number
  emailMasked: string
  displayName: string
  createdAt: string
}

export async function fetchPendingUploadUsers(token: string): Promise<PendingUploadUser[]> {
  const res = await fetch(`${API_BASE}/auth/users-pending-upload.php`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await readJsonResponse<{ users?: PendingUploadUser[]; error?: string; detail?: string }>(res)
  if (!res.ok) throwAuthError(res, data, 'Liste konnte nicht geladen werden')
  return data.users ?? []
}

export async function approveUserPhotoUpload(token: string, userId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/user-approve-upload.php`, {
    method: 'POST',
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ userId }),
  })
  const data = await readJsonResponse<{ error?: string; detail?: string; ok?: boolean }>(res)
  if (!res.ok) throwAuthError(res, data, 'Freigabe fehlgeschlagen')
}
