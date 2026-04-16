<?php
/**
 * Gebäudefoto: Status (GET), Upload (POST), Löschen (DELETE).
 * Nähe-Check aus geometry_json; lat/lng werden nicht gespeichert.
 * Neue Uploads: moderation_status = pending (öffentlich erst nach Freigabe via building-photo-moderate.php).
 * GET mit public=1 (ohne Anmeldung): nur { hasApprovedPhoto } für die öffentliche Kartenansicht.
 * Upload: Originaldatei + JPEG-Anzeigeversion (max. Kante 1600 px, GD); Auslieferung nur filename (Anzeige).
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_helpers.php';

const PHOTO_MAX_DISTANCE_M = 250.0;
const PHOTO_MAX_BYTES = 6 * 1024 * 1024;

function haversine_m(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $R = 6371000.0;
    $φ1 = deg2rad($lat1);
    $φ2 = deg2rad($lat2);
    $Δφ = deg2rad($lat2 - $lat1);
    $Δλ = deg2rad($lon2 - $lon1);
    $a = sin($Δφ / 2) ** 2 + cos($φ1) * cos($φ2) * sin($Δλ / 2) ** 2;
    return 2 * $R * atan2(sqrt($a), sqrt(1 - $a));
}

/** @return array{0: float, 1: float}|null lng, lat */
function ring_centroid_lng_lat(array $ring): ?array {
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
    return [$sy / $n, $sx / $n];
}

/** @return array{0: float, 1: float}|null lng, lat */
function geojson_centroid_lng_lat(?string $json): ?array {
    if ($json === null || $json === '') {
        return null;
    }
    $g = json_decode($json, true);
    if (!is_array($g) || !isset($g['type'])) {
        return null;
    }
    if ($g['type'] === 'Polygon' && !empty($g['coordinates'][0]) && is_array($g['coordinates'][0])) {
        return ring_centroid_lng_lat($g['coordinates'][0]);
    }
    if ($g['type'] === 'MultiPolygon' && !empty($g['coordinates'][0][0]) && is_array($g['coordinates'][0][0])) {
        return ring_centroid_lng_lat($g['coordinates'][0][0]);
    }
    return null;
}

function ensure_building_photos_table(PDO $pdo): void {
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS building_photos (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            building_id VARCHAR(128) NOT NULL,
            filename VARCHAR(80) NOT NULL,
            moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            user_id INT UNSIGNED NULL,
            UNIQUE KEY uq_building_one (building_id),
            CONSTRAINT fk_bp_building FOREIGN KEY (building_id) REFERENCES classifications (building_id) ON DELETE CASCADE,
            CONSTRAINT fk_bp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    try {
        $pdo->exec(
            "ALTER TABLE building_photos ADD COLUMN moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending' AFTER filename"
        );
    } catch (Throwable $e) {
        // Spalte existiert
    }
    try {
        $pdo->exec(
            'ALTER TABLE building_photos ADD COLUMN filename_original VARCHAR(80) NULL AFTER filename'
        );
    } catch (Throwable $e) {
        // Spalte existiert
    }
}

function photo_row_for_building(PDO $pdo, string $bid): ?array {
    $st = $pdo->prepare(
        'SELECT filename, filename_original, moderation_status, user_id FROM building_photos WHERE building_id = :id LIMIT 1'
    );
    $st->execute([':id' => $bid]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r === false ? null : $r;
}

/** Nur erwartete Upload-Dateinamen (Anzeige oder Original). */
function bp_unlink_uploaded_photo_file(?string $filename): void {
    if ($filename === null || $filename === '') {
        return;
    }
    if (!preg_match('/^[a-f0-9]{32}\\.(jpg|jpeg|png|webp)$/i', $filename)
        && !preg_match('/^[a-f0-9]{32}_orig\\.(jpg|jpeg|png|webp)$/i', $filename)) {
        return;
    }
    $path = __DIR__ . '/uploads/buildings/' . $filename;
    if (is_file($path)) {
        @unlink($path);
    }
}

/** Zeile building_photos: Anzeige- und optional Originaldatei löschen. */
function bp_delete_photo_row_files(?array $row): void {
    if ($row === null) {
        return;
    }
    $fn = isset($row['filename']) ? (string) $row['filename'] : '';
    bp_unlink_uploaded_photo_file($fn !== '' ? $fn : null);
    $fo = isset($row['filename_original']) ? (string) $row['filename_original'] : '';
    if ($fo !== '') {
        bp_unlink_uploaded_photo_file($fo);
    }
}

/**
 * Erzeugt JPEG-Anzeigeversion (max. Kante), aus Quellbild. false bei fehlendem GD oder Fehler.
 */
function bp_try_create_display_jpeg(string $sourcePath, string $destJpgPath, int $maxEdge = 1600, int $quality = 82): bool {
    if (!extension_loaded('gd') || !is_file($sourcePath)) {
        return false;
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($sourcePath);
    $im = false;
    if ($mime === 'image/jpeg') {
        $im = @imagecreatefromjpeg($sourcePath);
    } elseif ($mime === 'image/png') {
        $im = @imagecreatefrompng($sourcePath);
    } elseif ($mime === 'image/webp' && function_exists('imagecreatefromwebp')) {
        $im = @imagecreatefromwebp($sourcePath);
    }
    if ($im === false) {
        return false;
    }
    $w = imagesx($im);
    $h = imagesy($im);
    if ($w < 1 || $h < 1) {
        imagedestroy($im);
        return false;
    }
    $scale = min(1.0, $maxEdge / max($w, $h));
    $nw = max(1, (int) round($w * $scale));
    $nh = max(1, (int) round($h * $scale));
    $dst = imagecreatetruecolor($nw, $nh);
    if ($dst === false) {
        imagedestroy($im);
        return false;
    }
    imagealphablending($dst, false);
    $white = imagecolorallocate($dst, 255, 255, 255);
    imagefill($dst, 0, 0, $white);
    imagealphablending($dst, true);
    imagecopyresampled($dst, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
    imagedestroy($im);
    $ok = imagejpeg($dst, $destJpgPath, $quality);
    imagedestroy($dst);
    return $ok;
}

try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Datenbankverbindung fehlgeschlagen']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$userId = auth_user_id_from_request();

if ($method === 'GET' && isset($_GET['public']) && (string) $_GET['public'] === '1') {
    $bid = isset($_GET['building_id']) ? trim((string) $_GET['building_id']) : '';
    if ($bid === '' || strlen($bid) > 128) {
        http_response_code(400);
        echo json_encode(['hasApprovedPhoto' => false, 'error' => 'building_id fehlt'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    try {
        ensure_marks_tables($pdo);
        ensure_building_photos_table($pdo);
        $pr = photo_row_for_building($pdo, $bid);
        $ok = $pr !== null && (($pr['moderation_status'] ?? '') === 'approved');
        echo json_encode(['hasApprovedPhoto' => $ok], JSON_UNESCAPED_UNICODE);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['hasApprovedPhoto' => false], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

if ($method === 'GET') {
    if ($userId === null) {
        http_response_code(401);
        echo json_encode([
            'canUpload' => false,
            'reason' => 'Anmeldung erforderlich',
            'photo' => [
                'hasPhoto' => false,
                'moderationStatus' => null,
                'isUploader' => false,
                'canDelete' => false,
                'publicImagePath' => null,
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $bid = isset($_GET['building_id']) ? trim((string) $_GET['building_id']) : '';
    if ($bid === '' || strlen($bid) > 128) {
        http_response_code(400);
        echo json_encode(['canUpload' => false, 'reason' => 'building_id fehlt']);
        exit;
    }
    try {
        ensure_marks_tables($pdo);
        ensure_building_photos_table($pdo);

        $stmt = $pdo->prepare('SELECT geometry_json FROM classifications WHERE building_id = :id LIMIT 1');
        $stmt->execute([':id' => $bid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $canUpload = false;
        $reason = null;
        if (!$row || empty($row['geometry_json'])) {
            $reason = 'Bitte zuerst klassifizieren und speichern (Gebäudeumriss für den Abstand zum Aufnahmeort).';
        } else {
            $c = geojson_centroid_lng_lat($row['geometry_json']);
            if ($c === null) {
                $reason = 'Ungültige Geometrie gespeichert.';
            } else {
                $canUpload = true;
            }
        }

        $photo = [
            'hasPhoto' => false,
            'moderationStatus' => null,
            'isUploader' => false,
            'canDelete' => false,
            /** Relativer Pfad nur bei Freigabe (öffentlich über building-photo-serve.php). */
            'publicImagePath' => null,
        ];

        $pr = photo_row_for_building($pdo, $bid);
        if ($pr !== null) {
            $status = (string) ($pr['moderation_status'] ?? 'pending');
            $ownerId = $pr['user_id'] !== null ? (int) $pr['user_id'] : 0;
            $photo['hasPhoto'] = true;
            $photo['moderationStatus'] = $status;
            $photo['isUploader'] = $ownerId > 0 && $ownerId === (int) $userId;
            $photo['canDelete'] = $photo['isUploader'] || is_photo_moderator((int) $userId);
            if ($status === 'approved') {
                $photo['publicImagePath'] = 'building-photo-serve.php?building_id=' . rawurlencode($bid);
            }
        }

        echo json_encode([
            'canUpload' => $canUpload,
            'reason' => $reason,
            'photo' => $photo,
        ], JSON_UNESCAPED_UNICODE);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['canUpload' => false, 'reason' => 'Serverfehler']);
    }
    exit;
}

if ($method === 'DELETE') {
    if ($userId === null) {
        http_response_code(401);
        echo json_encode(['error' => 'Anmeldung erforderlich']);
        exit;
    }
    $bid = isset($_GET['building_id']) ? trim((string) $_GET['building_id']) : '';
    if ($bid === '' || strlen($bid) > 128) {
        http_response_code(400);
        echo json_encode(['error' => 'building_id fehlt']);
        exit;
    }
    ensure_marks_tables($pdo);
    ensure_building_photos_table($pdo);
    $pr = photo_row_for_building($pdo, $bid);
    if ($pr === null) {
        http_response_code(404);
        echo json_encode(['error' => 'Kein Foto']);
        exit;
    }
    $ownerId = $pr['user_id'] !== null ? (int) $pr['user_id'] : 0;
    if ($ownerId !== (int) $userId && !is_photo_moderator((int) $userId)) {
        http_response_code(403);
        echo json_encode(['error' => 'Keine Berechtigung']);
        exit;
    }
    $pdo->prepare('DELETE FROM building_photos WHERE building_id = :id')->execute([':id' => $bid]);
    bp_delete_photo_row_files($pr);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Methode nicht unterstützt']);
    exit;
}

if ($userId === null) {
    http_response_code(401);
    echo json_encode(['error' => 'Anmeldung erforderlich']);
    exit;
}

ensure_marks_tables($pdo);
ensure_building_photos_table($pdo);

$bid = isset($_POST['building_id']) ? trim((string) $_POST['building_id']) : '';
$latS = $_POST['lat'] ?? '';
$lngS = $_POST['lng'] ?? '';

if ($bid === '' || strlen($bid) > 128) {
    http_response_code(400);
    echo json_encode(['error' => 'building_id fehlt']);
    exit;
}

if (!is_numeric($latS) || !is_numeric($lngS)) {
    http_response_code(400);
    echo json_encode(['error' => 'lat/lng für Näheprüfung erforderlich (werden nicht gespeichert)']);
    exit;
}

$lat = (float) $latS;
$lng = (float) $lngS;
if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Koordinaten']);
    exit;
}

if (!isset($_FILES['photo']) || !is_uploaded_file($_FILES['photo']['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Keine Datei (Feldname photo)']);
    exit;
}

if ($_FILES['photo']['size'] > PHOTO_MAX_BYTES) {
    http_response_code(400);
    echo json_encode(['error' => 'Datei zu groß (max. 6 MB)']);
    exit;
}

try {
    $stmt = $pdo->prepare('SELECT geometry_json FROM classifications WHERE building_id = :id LIMIT 1');
    $stmt->execute([':id' => $bid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || empty($row['geometry_json'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Gebäude nicht gespeichert oder ohne Umriss. Bitte zuerst speichern.']);
        exit;
    }
    $centroid = geojson_centroid_lng_lat($row['geometry_json']);
    if ($centroid === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Geometrie nicht auswertbar']);
        exit;
    }
    [$cLng, $cLat] = $centroid;
    $dist = haversine_m($lat, $lng, $cLat, $cLng);
    if ($dist > PHOTO_MAX_DISTANCE_M) {
        http_response_code(403);
        echo json_encode([
            'error' => 'Sie sind zu weit vom Gebäude entfernt (max. ' . (int) PHOTO_MAX_DISTANCE_M . ' m).',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Serverfehler']);
    exit;
}

$tmp = $_FILES['photo']['tmp_name'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($tmp);
$extMap = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];
if (!isset($extMap[$mime])) {
    http_response_code(400);
    echo json_encode(['error' => 'Nur JPEG, PNG oder WebP erlaubt']);
    exit;
}
$ext = $extMap[$mime];

$uploadDir = __DIR__ . '/uploads/buildings';
if (!is_dir($uploadDir)) {
    if (!@mkdir($uploadDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Upload-Verzeichnis fehlt']);
        exit;
    }
}

$base = bin2hex(random_bytes(16));
$origFn = $base . '_orig.' . $ext;
$origPath = $uploadDir . '/' . $origFn;
if (!@move_uploaded_file($tmp, $origPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Speichern fehlgeschlagen']);
    exit;
}

$dispFn = $base . '.jpg';
$dispPath = $uploadDir . '/' . $dispFn;
$fnDisplay = $origFn;
$fnOriginalDb = null;
if (bp_try_create_display_jpeg($origPath, $dispPath)) {
    $fnDisplay = $dispFn;
    $fnOriginalDb = $origFn;
} else {
    if (is_file($dispPath)) {
        @unlink($dispPath);
    }
    $singleFn = $base . '.' . $ext;
    $singlePath = $uploadDir . '/' . $singleFn;
    if ($singleFn !== $origFn) {
        if (!@rename($origPath, $singlePath)) {
            bp_unlink_uploaded_photo_file($origFn);
            http_response_code(500);
            echo json_encode(['error' => 'Speichern fehlgeschlagen']);
            exit;
        }
    }
    $fnDisplay = $singleFn;
    $fnOriginalDb = null;
}

try {
    $pdo->beginTransaction();
    $old = photo_row_for_building($pdo, $bid);
    if ($old !== null) {
        bp_delete_photo_row_files($old);
    }
    $pdo->prepare('DELETE FROM building_photos WHERE building_id = :bid')->execute([':bid' => $bid]);
    $ins = $pdo->prepare(
        'INSERT INTO building_photos (building_id, filename, filename_original, moderation_status, user_id) VALUES (:bid, :fn, :fno, :st, :uid)'
    );
    $ins->execute([
        ':bid' => $bid,
        ':fn' => $fnDisplay,
        ':fno' => $fnOriginalDb,
        ':st' => 'pending',
        ':uid' => $userId,
    ]);
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    bp_unlink_uploaded_photo_file($fnDisplay);
    if ($fnOriginalDb !== null) {
        bp_unlink_uploaded_photo_file($fnOriginalDb);
    }
    http_response_code(500);
    echo json_encode(['error' => 'Datenbankfehler']);
    exit;
}

echo json_encode([
    'ok' => true,
    'moderationStatus' => 'pending',
    'message' => 'Foto wurde hochgeladen und wartet auf Freigabe. Öffentlich sichtbar erst nach Prüfung.',
], JSON_UNESCAPED_UNICODE);
