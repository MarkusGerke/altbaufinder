# Altbaufinder Berlin-Mitte

Webtool zur manuellen Klassifizierung von Altbauten in Berlin-Mitte auf Basis von OpenStreetMap-Gebäudedaten. Gebäude können als Original (grün), entstuckt/verunstaltet (gelb) oder nicht mehr vorhanden (rot) markiert werden.

## Technologie

- React + TypeScript + Vite
- MapLibre GL JS für 2D/3D-Karte
- OpenStreetMap-Daten und -Tiles (kostenfrei)

## Karten & Daten – Lizenzhinweise

- **Kartenkacheln**: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- **Gebäudedaten**: OpenStreetMap (ODbL) – [Attribution](https://www.openstreetmap.org/copyright) erforderlich

## Entwicklung

```bash
npm install
npm run dev
```

## Gebäudedaten (OSM) – alle Hausflächen von Berlin-Mitte

Die App lädt die Hausflächen aus `public/data/berlin_mitte_buildings.geojson`. Enthalten sind derzeit drei Beispieldaten; für **alle** in OSM erfassten Gebäudegrundrisse in Berlin-Mitte:

1. [Overpass Turbo](https://overpass-turbo.eu/) öffnen.
2. Abfrage aus `scripts/overpass-berlin-mitte.txt` einfügen (erfasst den Bezirk Berlin-Mitte) und **Abfrage ausführen**.
3. **Export** → **GeoJSON** wählen und die Datei als `public/data/berlin_mitte_buildings.geojson` im Projekt speichern (bestehende Datei ersetzen).
4. App neu laden – die Karte zeigt alle geladenen Gebäude, die du wie gewohnt anklicken und einfärben kannst.

Die App normalisiert die IDs aus dem Overpass-Export automatisch; es sind keine manuellen Anpassungen am GeoJSON nötig.

## Build

```bash
npm run build
```

Statische Ausgabe in `dist/`, z.B. für GitHub Pages, Netlify oder Vercel.

Produktion mit API-URL (all-inkl):

```bash
VITE_API_URL=https://altbaufinder.markusgerke.com/api npm run build
```

## GitHub & automatisches Deployment (all-inkl)

Repository: [github.com/MarkusGerke/altbaufinder](https://github.com/MarkusGerke/altbaufinder)

### Was automatisch läuft

- **CI** (`.github/workflows/ci.yml`): bei **Pull Requests** gegen `main` (und manuell „Run workflow“) → `npm ci`, Lint, Production-Build. Push auf `main` löst nur **Deploy** aus (ein Build).
- **Deploy** (`.github/workflows/deploy.yml`): bei Push auf `main` → Build, dann **optional** Upload per **SSH/rsync** und/oder **FTP** — je nachdem, welche Secrets gesetzt sind.
- **Dependabot** (`.github/dependabot.yml`): wöchentlich npm-, monatlich GitHub-Actions-Updates als PRs.

### Lokale Kurzbefehle

```bash
npm run build:prod   # Build mit Produktions-API-URL
npm run check        # Lint + Production-Build (wie CI)
```

### Secrets (GitHub → Settings → Secrets and variables → Actions)

**Variante A – SSH (empfohlen, wenn Deploy-Key auf dem Server funktioniert)**

| Secret | Beispiel / Hinweis |
|--------|---------------------|
| `SSH_PRIVATE_KEY` | Inhalt der **privaten** Deploy-Key-Datei |
| `SSH_HOST` | z. B. `w00d7d54.kasserver.com` |
| `SSH_USER` | z. B. `ssh-w00d7d54` |
| `REMOTE_WEBROOT` | Absoluter Pfad zum Webroot der Subdomain, **mit /** am Ende |

**Variante B – FTP (ohne SSH-Key; all-inkl-Zugang wie im FTP-Client)**

| Secret | Beispiel / Hinweis |
|--------|---------------------|
| `FTP_SERVER` | z. B. `w00d7d54.kasserver.com` |
| `FTP_USERNAME` | z. B. FTP-Benutzer aus dem KAS |
| `FTP_PASSWORD` | FTP-Passwort |
| `FTP_REMOTE_DIR` | Ordner der Subdomain **ohne** führenden Slash, z. B. `altbaufinder.markusgerke.com` |

Es werden nur `classifications.php`, `db.php`, `schema.sql`, `config.example.php` hochgeladen — **`api/config.php` liegt nur auf dem Server** und wird nicht überschrieben.

Nur **eine** Variante (SSH **oder** FTP) Secrets setzen, sonst laufen beide Deploy-Jobs.

FTP nutzt im Workflow **ftps** auf Port **21**. Wenn dein Hoster nur Klartext-FTP erlaubt, in `.github/workflows/deploy.yml` bei beiden FTP-Schritten `protocol: ftp` setzen.

Details und Kommentare: `.github/workflows/deploy.yml`.

## Spätere Ausbaustufe: Web-Speicherung (V2)

Für kollaboratives Arbeiten oder Gerätewechsel kann ein schlankes Backend ergänzt werden – **ohne laufende Kosten** (Free-Tier oder self-hosted):

- **API**: `GET /classifications?bbox=...` liefert Klassifizierungen für einen Kartenausschnitt; `POST /classifications` nimmt neue/aktualisierte Einträge (z. B. Array von `{ buildingId, classification, lastModified }`) entgegen.
- **Sync**: Lokale Änderungen beim Verlassen oder per Button hochladen; beim Start Klassifizierungen für den sichtbaren Bereich laden und mit lokalem Stand mergen (z. B. „Last write wins“ pro Gebäude-ID).
- **Hosting**: z. B. Free-Tier (Railway, Render, Fly.io), eigener Rechner oder Raspberry Pi; Speicher z. B. SQLite oder JSON-Dateien.

Die bestehende Export-/Import-Funktion bleibt nutzbar und kann als Fallback oder für Offline-Arbeit genutzt werden.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
