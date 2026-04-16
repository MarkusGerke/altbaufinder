<?php
/**
 * Berlin-Bounding-Box (WGS84) – konsistent mit src/lib/berlinBounds.ts
 */
const BERLIN_LAT_MIN = 52.339;
const BERLIN_LAT_MAX = 52.676;
const BERLIN_LNG_MIN = 13.088;
const BERLIN_LNG_MAX = 13.762;

function berlin_point_in_bbox(float $lat, float $lng): bool {
    return $lat >= BERLIN_LAT_MIN && $lat <= BERLIN_LAT_MAX
        && $lng >= BERLIN_LNG_MIN && $lng <= BERLIN_LNG_MAX;
}

/** @return array{0: float, 1: float}|null lat, lng */
function berlin_ring_centroid_lat_lng(array $ring): ?array {
    $sx = 0.0;
    $sy = 0.0;
    $n = 0;
    $count = count($ring);
    $limit = $count >= 4 ? $count - 1 : $count;
    for ($i = 0; $i < $limit; $i++) {
        if (!isset($ring[$i][0], $ring[$i][1])) {
            continue;
        }
        $sx += (float) $ring[$i][1];
        $sy += (float) $ring[$i][0];
        $n++;
    }
    if ($n < 1) {
        return null;
    }
    return [$sx / $n, $sy / $n];
}

/** @return array{lat: float, lng: float}|null */
function berlin_geojson_centroid_lat_lng(?string $json): ?array {
    if ($json === null || $json === '') {
        return null;
    }
    $g = json_decode($json, true);
    if (!is_array($g) || !isset($g['type'])) {
        return null;
    }
    if ($g['type'] === 'Polygon' && !empty($g['coordinates'][0]) && is_array($g['coordinates'][0])) {
        $c = berlin_ring_centroid_lat_lng($g['coordinates'][0]);
        if ($c === null) {
            return null;
        }
        return ['lat' => $c[0], 'lng' => $c[1]];
    }
    if ($g['type'] === 'MultiPolygon' && !empty($g['coordinates'][0][0]) && is_array($g['coordinates'][0][0])) {
        $c = berlin_ring_centroid_lat_lng($g['coordinates'][0][0]);
        if ($c === null) {
            return null;
        }
        return ['lat' => $c[0], 'lng' => $c[1]];
    }
    return null;
}

/** Schwerpunkt der Geometrie liegt in der Berlin-Box (für Speichern). */
function berlin_geometry_json_centroid_inside(?string $geomJson): bool {
    $c = berlin_geojson_centroid_lat_lng($geomJson);
    if ($c === null) {
        return false;
    }
    return berlin_point_in_bbox($c['lat'], $c['lng']);
}
