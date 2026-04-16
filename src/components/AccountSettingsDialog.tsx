import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  AUTH_TOKEN_KEY,
  approveUserPhotoUpload,
  fetchPendingUploadUsers,
  type PendingUploadUser,
} from '@/services/authApi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AccountSettingsDialogProps {
  open: boolean
  onClose: () => void
}

export default function AccountSettingsDialog({ open, onClose }: AccountSettingsDialogProps) {
  const { user, updateDisplayName, updateEmail, changePassword, deleteAccount, refreshMe } = useAuth()
  const [emailPwd, setEmailPwd] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newPwd2, setNewPwd2] = useState('')
  const [deletePwd, setDeletePwd] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [pendingUploadUsers, setPendingUploadUsers] = useState<PendingUploadUser[]>([])
  const [pendingUploadLoading, setPendingUploadLoading] = useState(false)
  const [approveBusyId, setApproveBusyId] = useState<number | null>(null)

  useEffect(() => {
    if (open && user?.email) {
      setNewEmail(user.email)
      setDisplayNameInput(user.displayName ?? '')
    }
  }, [open, user?.email, user?.displayName])

  useEffect(() => {
    if (!open || user?.isAccountApprover !== true) {
      setPendingUploadUsers([])
      return
    }
    let cancelled = false
    setPendingUploadLoading(true)
    const token = (() => {
      try {
        return localStorage.getItem(AUTH_TOKEN_KEY)
      } catch {
        return null
      }
    })()
    if (!token) {
      setPendingUploadLoading(false)
      return
    }
    void fetchPendingUploadUsers(token)
      .then((list) => {
        if (!cancelled) setPendingUploadUsers(list)
      })
      .catch(() => {
        if (!cancelled) setPendingUploadUsers([])
      })
      .finally(() => {
        if (!cancelled) setPendingUploadLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, user?.isAccountApprover])

  const resetForms = () => {
    setEmailPwd('')
    setNewEmail(user?.email ?? '')
    setOldPwd('')
    setNewPwd('')
    setNewPwd2('')
    setDeletePwd('')
    setDeleteConfirm('')
    setDisplayNameInput(user?.displayName ?? '')
    setMsg(null)
    setErr(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onClose()
      resetForms()
    }
  }

  const onSubmitDisplayName = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    setPending(true)
    try {
      await updateDisplayName(displayNameInput.trim())
      setMsg('Anzeigename wurde gespeichert.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const onSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    setPending(true)
    try {
      await updateEmail(emailPwd, newEmail.trim())
      setMsg('E-Mail wurde geändert.')
      setEmailPwd('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (newPwd !== newPwd2) {
      setErr('Neue Passwörter stimmen nicht überein.')
      return
    }
    setPending(true)
    try {
      await changePassword(oldPwd, newPwd)
      setMsg('Passwort wurde geändert.')
      setOldPwd('')
      setNewPwd('')
      setNewPwd2('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const onDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (deleteConfirm !== 'LÖSCHEN') {
      setErr('Bitte genau „LÖSCHEN“ in das Feld eintragen.')
      return
    }
    setPending(true)
    try {
      await deleteAccount(deletePwd)
      onClose()
      resetForms()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setPending(false)
    }
  }

  const onApproveUpload = async (targetId: number) => {
    const token = (() => {
      try {
        return localStorage.getItem(AUTH_TOKEN_KEY)
      } catch {
        return null
      }
    })()
    if (!token) return
    setErr(null)
    setMsg(null)
    setApproveBusyId(targetId)
    try {
      await approveUserPhotoUpload(token, targetId)
      setPendingUploadUsers((prev) => prev.filter((u) => u.id !== targetId))
      setMsg('Nutzer wurde für Foto-Uploads freigeschaltet.')
      await refreshMe()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Freigabe fehlgeschlagen')
    } finally {
      setApproveBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" showCloseButton>
        <DialogHeader>
          <DialogTitle>Konto</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {err && <p className="text-destructive text-sm">{err}</p>}
          {msg && !err && <p className="text-muted-foreground text-sm">{msg}</p>}

          {user?.isAccountApprover === true && (
            <div className="space-y-3 border-b border-border pb-6">
              <p className="font-medium">Foto-Upload: wartende Konten</p>
              <p className="text-muted-foreground text-xs">
                Neue Registrierungen können erst nach deiner Freigabe Fotos hochladen.
              </p>
              {pendingUploadLoading ? (
                <p className="text-muted-foreground text-sm">Lade Liste …</p>
              ) : pendingUploadUsers.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine ausstehenden Konten.</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {pendingUploadUsers.map((u) => (
                    <li
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{u.displayName}</span>
                        <span className="text-muted-foreground block text-xs">{u.emailMasked}</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        disabled={approveBusyId !== null}
                        onClick={() => void onApproveUpload(u.id)}
                      >
                        {approveBusyId === u.id ? '…' : 'Freischalten'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form onSubmit={onSubmitDisplayName} className="space-y-3 border-b border-border pb-6">
            <p className="font-medium">Anzeigename</p>
            <p className="text-muted-foreground text-xs">
              Sichtbar im Highscore (nicht deine E-Mail).
            </p>
            <div className="space-y-2">
              <Label htmlFor="acc-display-name">Name</Label>
              <Input
                id="acc-display-name"
                type="text"
                autoComplete="nickname"
                name="displayName"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Anzeigename speichern
            </Button>
          </form>

          <form onSubmit={onSubmitEmail} className="space-y-3 border-b border-border pb-6">
            <p className="font-medium">E-Mail ändern</p>
            <div className="space-y-2">
              <Label htmlFor="acc-email-new">Neue E-Mail</Label>
              <Input
                id="acc-email-new"
                type="email"
                autoComplete="email"
                name="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={user?.email ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-email-pwd">Aktuelles Passwort</Label>
              <Input
                id="acc-email-pwd"
                type="password"
                autoComplete="current-password"
                name="password"
                value={emailPwd}
                onChange={(e) => setEmailPwd(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              E-Mail speichern
            </Button>
          </form>

          <form onSubmit={onSubmitPassword} className="space-y-3 border-b border-border pb-6">
            <p className="font-medium">Passwort ändern</p>
            <div className="space-y-2">
              <Label htmlFor="acc-old-pwd">Aktuelles Passwort</Label>
              <Input
                id="acc-old-pwd"
                type="password"
                autoComplete="current-password"
                name="current-password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-new-pwd">Neues Passwort</Label>
              <Input
                id="acc-new-pwd"
                type="password"
                autoComplete="new-password"
                name="new-password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-new-pwd2">Neues Passwort wiederholen</Label>
              <Input
                id="acc-new-pwd2"
                type="password"
                autoComplete="new-password"
                value={newPwd2}
                onChange={(e) => setNewPwd2(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Passwort speichern
            </Button>
          </form>

          <form onSubmit={onDelete} className="space-y-3">
            <p className="text-destructive font-medium">Konto löschen</p>
            <p className="text-muted-foreground text-xs">
              Alle deine Markierungen und das Konto werden unwiderruflich entfernt.
            </p>
            <div className="space-y-2">
              <Label htmlFor="acc-del-pwd">Passwort</Label>
              <Input
                id="acc-del-pwd"
                type="password"
                autoComplete="current-password"
                value={deletePwd}
                onChange={(e) => setDeletePwd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-del-confirm">Zur Bestätigung „LÖSCHEN“ eintippen</Label>
              <Input
                id="acc-del-confirm"
                type="text"
                autoComplete="off"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" variant="destructive" size="sm" disabled={pending}>
              Konto endgültig löschen
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
