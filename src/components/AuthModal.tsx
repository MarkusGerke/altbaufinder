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
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
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
          <TabsContent value="login" className="mt-0 pt-4">
            <AuthFormInner
              mode="login"
              email={email}
              password={password}
              setEmail={setEmail}
              setPassword={setPassword}
              displayError={displayError}
              pending={pending}
              onSubmit={submit}
            />
          </TabsContent>
          <TabsContent value="register" className="mt-0 pt-4">
            <AuthFormInner
              mode="register"
              email={email}
              password={password}
              setEmail={setEmail}
              setPassword={setPassword}
              displayError={displayError}
              pending={pending}
              onSubmit={submit}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function AuthFormInner({
  mode,
  email,
  password,
  setEmail,
  setPassword,
  displayError,
  pending,
  onSubmit,
}: {
  mode: 'login' | 'register'
  email: string
  password: string
  setEmail: (v: string) => void
  setPassword: (v: string) => void
  displayError: string | null
  pending: boolean
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`auth-email-${mode}`}>E-Mail</Label>
        <Input
          id={`auth-email-${mode}`}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`auth-password-${mode}`}>Passwort (min. 8 Zeichen)</Label>
        <Input
          id={`auth-password-${mode}`}
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {displayError && <p className="text-destructive text-sm">{displayError}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? '…' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
      </Button>
    </form>
  )
}
