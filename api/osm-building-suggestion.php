<?php
/**
 * Read-only: OSM-Element-Tags abrufen und interne building_use-Vorschlagswerte liefern.
 * Keine Nutzerdaten an OSM; moderates Caching (24h).
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Nur GET']);
    exit;
}

require_once __DIR__ . '/building_use_mapping.php';

$type = isset($_GET['type']) ? strtolower(trim((string) $_GET['type'])) : '';
$id = isset($_GET['id']) ? preg_replace('/\D/', '', (string) $_GET['id']) : '';

if (($type !== 'way' && $type !== 'relation') || $id === '' || strlen($id) > 15) {
    http_response_code(400);
    echo json_encode(['error' => 'Parameter type=way|relation und id (Ziffern) erforderlich']);
    exit;
}

$labelsDe = [
    'wohnhaus' => 'Wohnhaus / Wohnen',
    'buero' => 'Büro / Verwaltung',
    'einkauf' => 'Einkauf / Handel',
    'krankenhaus' => 'Krankenhaus / Gesundheit',
    'amt' => 'Amt / Behörde',
    'bahnhof' => 'Bahnhof / Schienenverkehr',
    'schule' => 'Schule / Bildung',
    'hotel' => 'Hotel / Unterkunft',
    'industrie' => 'Industrie / Gewerbe',
    'kirche' => 'Kirche / Gotteshaus',
    'kultur' => 'Kultur',
    'sport' => 'Sport',
    'verkehr_parken' => 'Parken / Verkehr',
    'sonstiges' => 'Sonstiges',
    'unbekannt' => 'Unbekannt',
];

$cacheDir = __DIR__ . '/cache/osm_suggestions';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
$cacheFile = $cacheDir . '/' . $type . '_' . $id . '.json';
$ttl = 86400;

if (is_readable($cacheFile)) {
    $raw = @file_get_contents($cacheFile);
    if ($raw !== false) {
        $cached = json_decode($raw, true);
        if (is_array($cached) && isset($cached['ts'], $cached['payload'])
            && (time() - (int) $cached['ts']) < $ttl) {
            echo json_encode($cached['payload'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
}

$path = $type === 'relation' ? "relation/{$id}" : "way/{$id}";
$url = 'https://api.openstreetmap.org/api/0.6/' . $path;

$ctx = stream_context_create([
    'http' => [
        'method' => 'GET',
        'header' => "User-Agent: Altbaufinder/1.0 (building suggestion; contact: admin)\r\n",
        'timeout' => 12,
    ],
]);

$xmlStr = @file_get_contents($url, false, $ctx);
if ($xmlStr === false || $xmlStr === '') {
    http_response_code(502);
    echo json_encode(['error' => 'OSM-Anfrage fehlgeschlagen']);
    exit;
}

libxml_use_internal_errors(true);
$xml = simplexml_load_string($xmlStr);
if ($xml === false) {
    http_response_code(502);
    echo json_encode(['error' => 'OSM-Antwort ungültig']);
    exit;
}

$tags = [];
$ns = $xml->getNamespaces(true);
$children = $xml->children(isset($ns['']) ? '' : null);
$nodeName = $type === 'relation' ? 'relation' : 'way';
$el = $xml->{$nodeName} ?? $children->{$nodeName} ?? null;
if ($el === null) {
    foreach ($xml->children() as $child) {
        if ($child->getName() === $nodeName) {
            $el = $child;
            break;
        }
    }
}
if ($el === null) {
    http_response_code(404);
    echo json_encode(['error' => 'Element nicht gefunden']);
    exit;
}

foreach ($el->tag as $tag) {
    $k = isset($tag['k']) ? (string) $tag['k'] : '';
    $v = isset($tag['v']) ? (string) $tag['v'] : '';
    if ($k !== '') {
        $tags[$k] = $v;
    }
}

[$buildingUse, $confidence] = osm_tags_to_building_use($tags);

$payload = [
    'buildingUse' => $buildingUse,
    'confidence' => $confidence,
    'labelDe' => $labelsDe[$buildingUse] ?? $buildingUse,
    'attribution' => 'Daten © OpenStreetMap-Mitwirkende, ODbL (nur lesend)',
];

@file_put_contents(
    $cacheFile,
    json_encode(['ts' => time(), 'payload' => $payload], JSON_UNESCAPED_UNICODE),
    LOCK_EX
);

echo json_encode($payload, JSON_UNESCAPED_UNICODE);
