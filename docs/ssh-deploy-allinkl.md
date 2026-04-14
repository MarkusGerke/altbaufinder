# SSH-Deploy (GitHub Actions → all-inkl), ohne FTP

Ziel: Nach jedem Push auf `main` baut GitHub das Projekt und lädt per **rsync über SSH** auf deinen Webspace — **ohne FTP**.

Voraussetzungen: **SSH im KAS aktiv** (Tarif Premium), Zugangsdaten aus **Tools → SSH-Zugänge** (Login + Host, z. B. `ssh-w00d7d54@w00d7d54.kasserver.com`).

---

## Schritt 1: Deploy-Key auf dem Mac erzeugen

**Nur für dieses Projekt / GitHub Actions** — nicht deinen persönlichen `id_ed25519` verwenden.

```bash
ssh-keygen -t ed25519 -C "github-actions-altbaufinder" -f ~/.ssh/altbaufinder_github_deploy -N ""
```

Es entstehen:

- `~/.ssh/altbaufinder_github_deploy` → **privater** Schlüssel (kommt ins GitHub-Secret)
- `~/.ssh/altbaufinder_github_deploy.pub` → **öffentlicher** Schlüssel (kommt auf den Server)

---

## Schritt 2: Öffentlichen Schlüssel auf dem Server eintragen

### 2a Einmal per Passwort einloggen

```bash
ssh DEIN_SSH_LOGIN@DEIN_HOST.kasserver.com
```

(Passwort: meist **FTP-Hauptbenutzer-Passwort**, siehe KAS.)

### 2b Auf dem Server

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```

**Eine Zeile** einfügen: Inhalt von `altbaufinder_github_deploy.pub` (auf dem Mac: `cat ~/.ssh/altbaufinder_github_deploy.pub` kopieren).

Datei speichern, dann:

```bash
chmod 600 ~/.ssh/authorized_keys
exit
```

### 2c Test vom Mac (ohne Passwort)

```bash
ssh -i ~/.ssh/altbaufinder_github_deploy -o IdentitiesOnly=yes DEIN_SSH_LOGIN@DEIN_HOST.kasserver.com
```

Wenn du **ohne Passwort** drin bist, ist der Key korrekt.

---

## Schritt 3: `REMOTE_WEBROOT` ermitteln

Auf dem Server (SSH-Session):

```bash
cd ~/altbaufinder.markusgerke.com
pwd
```

Oder den Pfad aus dem KAS/FTP-Root ableiten (häufig etwas wie `/www/htdocs/altbaufinder.markusgerke.com` — **exakt** so, wie `pwd` es ausgibt).

**Wichtig:** Als Secret **`REMOTE_WEBROOT`** mit **Slash am Ende** eintragen, z. B.:

`/www/htdocs/altbaufinder.markusgerke.com/`

(Damit `rsync … dist/ user@host:WEBROOT/` die Dateien ins richtige Verzeichnis legt.)

---

## Schritt 4: GitHub Secrets setzen

Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Inhalt |
|------|--------|
| `SSH_PRIVATE_KEY` | **Komplette** private Datei: `cat ~/.ssh/altbaufinder_github_deploy` (inkl. `BEGIN OPENSSH PRIVATE KEY` … `END`) |
| `SSH_HOST` | z. B. `w00d7d54.kasserver.com` |
| `SSH_USER` | z. B. `ssh-w00d7d54` |
| `REMOTE_WEBROOT` | Ausgabe von `pwd` + `/` |

---

## Schritt 5: Nur SSH, kein FTP

Wenn du früher **FTP-Secrets** angelegt hast: diese **löschen** (`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_REMOTE_DIR`). Sonst laufen SSH- und FTP-Deploy parallel.

---

## Schritt 6: Test durch Push

```bash
git commit --allow-empty -m "test: SSH-Deploy" && git push origin main
```

In GitHub unter **Actions** → Workflow **Deploy** prüfen: Job **deploy-ssh** soll grün sein, **deploy-ftp** darf nicht laufen (keine FTP-Secrets).

---

## Sicherheit

- Den **privaten** Deploy-Key **niemals** ins Repo committen, nicht in Issues/Chats posten.
- Key nur für diesen einen Zweck; bei Verlust: Zeile in `authorized_keys` auf dem Server entfernen, neuen Key erzeugen, GitHub-Secret aktualisieren.

---

## Troubleshooting

| Problem | Prüfen |
|--------|--------|
| `Permission denied (publickey)` | Zeile in `authorized_keys`, User/Host stimmen; `-i` Pfad zum privaten Key |
| `rsync: connection unexpectedly closed` | `REMOTE_WEBROOT` falsch oder ohne Schreibrechte |
| Deploy-Job fehlt | Alle vier SSH-Secrets müssen gesetzt sein (leere Secrets zählen als „nicht gesetzt“) |

Technische Details: `.github/workflows/deploy.yml`.
