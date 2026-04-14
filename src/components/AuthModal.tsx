import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register, error, clearError } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setLocalError(null)
      clearError()
    }
  }, [open, clearError])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!email.trim() || !password) {
      setLocalError('E-Mail und Passwort ausfüllen')
      return
    }
    setPending(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(email.trim(), password)
      setPassword('')
      onClose()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const displayError = localError ?? error

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-title"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 text-white rounded-xl shadow-xl max-w-sm w-full border border-slate-600"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2 px-4 py-3 border-b border-slate-600">
          <h2 id="auth-title" className="text-lg font-semibold">
            {mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none px-1" aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="p-4 flex gap-2 mb-2">
          <button
            type="button"
            className={`flex-1 py-1.5 rounded text-sm ${mode === 'login' ? 'bg-slate-600 ring-1 ring-slate-400' : 'bg-slate-700'}`}
            onClick={() => { setMode('login'); setLocalError(null) }}
          >
            Login
          </button>
          <button
            type="button"
            className={`flex-1 py-1.5 rounded text-sm ${mode === 'register' ? 'bg-slate-600 ring-1 ring-slate-400' : 'bg-slate-700'}`}
            onClick={() => { setMode('register'); setLocalError(null) }}
          >
            Registrieren
          </button>
        </div>
        <form onSubmit={submit} className="px-4 pb-4 space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="auth-email">E-Mail</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-2 py-2 rounded bg-slate-700 border border-slate-600 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="auth-password">Passwort (min. 8 Zeichen)</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-2 py-2 rounded bg-slate-700 border border-slate-600 text-white text-sm"
            />
          </div>
          {displayError && <p className="text-red-400 text-sm">{displayError}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium"
          >
            {pending ? '…' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
          </button>
        </form>
      </div>
    </div>
  )
}
