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

1. Auf GitHub ein **leeres** Repository `altbaufinder` unter deinem Account anlegen.
2. Lokal: `git init`, erster Commit, `git remote add origin …`, `git push -u origin main`.
3. **Deploy-Key** (nur lesen/schreiben Webspace): SSH-Key paar erzeugen, **öffentlichen** Schlüssel im KAS beim Webspace hinterlegen (falls all-inkl „SSH-Key“ anbietet), **privaten** Schlüssel als GitHub-Secret `SSH_PRIVATE_KEY` speichern.
4. Unter **Settings → Secrets and variables → Actions** diese Secrets setzen: `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `REMOTE_WEBROOT` (absoluter Serverpfad zum Ordner der Subdomain, mit `/` am Ende). Kommentare siehe `.github/workflows/deploy-allinkl.yml`.
5. Bei jedem Push auf **`main`** baut die Action das Projekt und lädt `dist/` und `api/` (ohne `config.php`) per **rsync** hoch. `api/config.php` bleibt nur auf dem Server und wird nicht überschrieben.

## Spätere Ausbaustufe: Web-Speicherung (V2)

Für kollaboratives Arbeiten oder Gerätewechsel kann ein schlankes Backend ergänzt werden – **ohne laufende Kosten** (Free-Tier oder self-hosted):

- **API**: `GET /classifications?bbox=...` liefert Klassifizierungen für einen Kartenausschnitt; `POST /classifications` nimmt neue/aktualisierte Einträge (z. B. Array von `{ buildingId, classification, lastModified }`) entgegen.
- **Sync**: Lokale Änderungen beim Verlassen oder per Button hochladen; beim Start Klassifizierungen für den sichtbaren Bereich laden und mit lokalem Stand mergen (z. B. „Last write wins“ pro Gebäude-ID).
- **Hosting**: z. B. Free-Tier (Railway, Render, Fly.io), eigener Rechner oder Raspberry Pi; Speicher z. B. SQLite oder JSON-Dateien.

Die bestehende Export-/Import-Funktion bleibt nutzbar und kann als Fallback oder für Offline-Arbeit genutzt werden.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
