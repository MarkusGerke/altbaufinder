import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register, error, clearError, requestPasswordReset } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [authView, setAuthView] = useState<'tabs' | 'forgot'>('tabs')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  useEffect(() => {
    if (open) {
      setLocalError(null)
      clearError()
      setAuthView('tabs')
      setForgotSent(false)
    }
  }, [open, clearError])

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
      else
        await register(
          email.trim(),
          password,
          displayName.trim() !== '' ? displayName.trim() : undefined
        )
      setPassword('')
      onClose()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const forgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!email.trim()) {
      setLocalError('E-Mail eingeben')
      return
    }
    setPending(true)
    try {
      await requestPasswordReset(email.trim())
      setForgotSent(true)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const displayError = localError ?? error

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        {authView === 'forgot' ? (
          <>
            <DialogHeader>
              <DialogTitle id="auth-title-forgot">Passwort zurücksetzen</DialogTitle>
            </DialogHeader>
            <form id="auth-form-forgot" onSubmit={forgotSubmit} className="space-y-3 pt-2">
              <p className="text-muted-foreground text-xs">
                Wir senden dir einen Link per E-Mail, falls ein Konto zu dieser Adresse existiert.
              </p>
              <div className="space-y-2">
                <Label htmlFor="auth-forgot-email">E-Mail</Label>
                <Input
                  id="auth-forgot-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {displayError && !forgotSent && (
                <p className="text-destructive text-sm">{displayError}</p>
              )}
              {forgotSent && (
                <p className="text-muted-foreground text-sm">
                  Wenn ein Konto existiert, erhältst du in Kürze eine E-Mail mit einem Link.
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending || forgotSent}>
                {pending ? '…' : 'Link anfordern'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setAuthView('tabs')
                  setForgotSent(false)
                  setLocalError(null)
                }}
              >
                Zurück zum Login
              </Button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle id="auth-title">Konto</DialogTitle>
            </DialogHeader>
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as 'login' | 'register')
                setLocalError(null)
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Registrieren</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-0 pt-4 space-y-3">
                <AuthFormInner
                  mode="login"
                  email={email}
                  password={password}
                  setEmail={setEmail}
                  setPassword={setPassword}
                  displayError={displayError}
                  pending={pending}
                  onSubmit={submit}
                  onForgotPassword={() => {
                    setAuthView('forgot')
                    setLocalError(null)
                  }}
                />
              </TabsContent>
              <TabsContent value="register" className="mt-0 pt-4">
                <AuthFormInner
                  mode="register"
                  email={email}
                  password={password}
                  displayName={displayName}
                  setEmail={setEmail}
                  setPassword={setPassword}
                  setDisplayName={setDisplayName}
                  displayError={displayError}
                  pending={pending}
                  onSubmit={submit}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AuthFormInner({
  mode,
  email,
  password,
  displayName,
  setEmail,
  setPassword,
  setDisplayName,
  displayError,
  pending,
  onSubmit,
  onForgotPassword,
}: {
  mode: 'login' | 'register'
  email: string
  password: string
  displayName?: string
  setEmail: (v: string) => void
  setPassword: (v: string) => void
  setDisplayName?: (v: string) => void
  displayError: string | null
  pending: boolean
  onSubmit: (e: React.FormEvent) => void
  onForgotPassword?: () => void
}) {
  const formId = mode === 'login' ? 'auth-form-login' : 'auth-form-register'
  const emailAuto = mode === 'login' ? 'username' : 'email'
  const emailName = mode === 'login' ? 'username' : 'email'
  const pwdName = mode === 'login' ? 'password' : 'new-password'
  const pwdAuto = mode === 'login' ? 'current-password' : 'new-password'

  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`auth-email-${mode}`}>E-Mail</Label>
        <Input
          id={`auth-email-${mode}`}
          type="email"
          name={emailName}
          autoComplete={emailAuto}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`auth-password-${mode}`}>Passwort (min. 8 Zeichen)</Label>
        <Input
          id={`auth-password-${mode}`}
          type="password"
          name={pwdName}
          autoComplete={pwdAuto}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {mode === 'register' && setDisplayName !== undefined && displayName !== undefined && (
        <div className="space-y-2">
          <Label htmlFor="auth-display-name">Anzeigename (optional)</Label>
          <Input
            id="auth-display-name"
            type="text"
            name="displayName"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Leer lassen für zufälligen Namen"
          />
          <p className="text-muted-foreground text-xs">
            Wird im Highscore angezeigt (nicht deine E-Mail).
          </p>
        </div>
      )}
      {displayError && <p className="text-destructive text-sm">{displayError}</p>}
      {mode === 'login' && onForgotPassword && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="link"
            className="text-primary h-auto px-0 py-0 text-sm underline-offset-4"
            onClick={onForgotPassword}
          >
            Passwort vergessen?
          </Button>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? '…' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
      </Button>
    </form>
  )
}
