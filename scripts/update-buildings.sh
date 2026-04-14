#!/bin/bash
# =============================================================================
# Wöchentliches OSM-Update für Altbaufinder
# Wird per Cronjob aufgerufen (z.B. Sonntag 03:00).
#
# Voraussetzungen auf all-inkl:
#   - curl, python3 oder jq (für GeoJSON-Konvertierung)
#   - Schreibzugriff auf $WEBROOT/data/
#
# Cronjob (über all-inkl KAS oder SSH):
#   0 3 * * 0 /pfad/zu/scripts/update-buildings.sh >> /pfad/zu/logs/update.log 2>&1
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBROOT="${WEBROOT:-$(dirname "$SCRIPT_DIR")/public}"
DATA_DIR="$WEBROOT/data"
OUTFILE="$DATA_DIR/berlin_mitte_buildings.geojson"
TMPFILE="$DATA_DIR/.buildings_update_tmp.json"
BACKUP="$DATA_DIR/berlin_mitte_buildings.backup.geojson"

OVERPASS_URL="https://overpass-api.de/api/interpreter"
OVERPASS_QUERY='[out:json][timeout:600];
(
  way["building"](52.34,13.09,52.68,13.76);
  relation["building"](52.34,13.09,52.68,13.76);
);
out body geom;
>;
out skel qt;'

echo "$(date '+%Y-%m-%d %H:%M:%S') — Start OSM-Update"

mkdir -p "$DATA_DIR"

echo "  Overpass-Abfrage starten..."
HTTP_CODE=$(curl -s -o "$TMPFILE" -w "%{http_code}" \
  --data-urlencode "data=$OVERPASS_QUERY" \
  "$OVERPASS_URL")

if [ "$HTTP_CODE" != "200" ]; then
  echo "  FEHLER: Overpass antwortete mit HTTP $HTTP_CODE"
  rm -f "$TMPFILE"
  exit 1
fi

FILESIZE=$(stat -f%z "$TMPFILE" 2>/dev/null || stat -c%s "$TMPFILE" 2>/dev/null)
if [ "$FILESIZE" -lt 1000 ]; then
  echo "  FEHLER: Antwort zu klein ($FILESIZE Bytes), vermutlich kein valides GeoJSON"
  rm -f "$TMPFILE"
  exit 1
fi

echo "  Overpass-JSON in GeoJSON konvertieren + IDs normalisieren..."
python3 - "$TMPFILE" "$OUTFILE" "$BACKUP" <<'PYTHON_SCRIPT'
import json, sys, os

tmpfile, outfile, backup = sys.argv[1], sys.argv[2], sys.argv[3]

with open(tmpfile, 'r') as f:
    data = json.load(f)

elements = data.get('elements', [])
features = []

for el in elements:
    etype = el.get('type')
    eid = el.get('id')
    tags = el.get('tags', {})

    if etype == 'way' and 'geometry' in el:
        coords = [[pt['lon'], pt['lat']] for pt in el['geometry']]
        if len(coords) >= 4:
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            fid = f"way-{eid}"
            props = {**tags, 'id': fid}
            features.append({
                'type': 'Feature',
                'id': fid,
                'properties': props,
                'geometry': {'type': 'Polygon', 'coordinates': [coords]}
            })

    elif etype == 'relation' and 'members' in el:
        outer_rings = []
        for member in el.get('members', []):
            if member.get('role') == 'outer' and 'geometry' in member:
                ring = [[pt['lon'], pt['lat']] for pt in member['geometry']]
                if len(ring) >= 4:
                    if ring[0] != ring[-1]:
                        ring.append(ring[0])
                    outer_rings.append(ring)
        if outer_rings:
            fid = f"relation-{eid}"
            props = {**tags, 'id': fid}
            if len(outer_rings) == 1:
                geom = {'type': 'Polygon', 'coordinates': [outer_rings[0]]}
            else:
                geom = {'type': 'MultiPolygon', 'coordinates': [[r] for r in outer_rings]}
            features.append({
                'type': 'Feature',
                'id': fid,
                'properties': props,
                'geometry': geom
            })

geojson = {'type': 'FeatureCollection', 'features': features}

if os.path.exists(outfile):
    os.replace(outfile, backup)

with open(outfile, 'w') as f:
    json.dump(geojson, f)

print(f"  {len(features)} Features geschrieben nach {outfile}")
PYTHON_SCRIPT

rm -f "$TMPFILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') — OSM-Update abgeschlossen"
