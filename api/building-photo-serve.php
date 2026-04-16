<?php
/**
 * Liefert das Gebäudefoto-Binary: öffentlich nur bei moderation_status = approved;
 * bei pending/rejected nur für Hochlader oder Foto-Moderator (Vorschau).
 * Tabelle building_photos wird durch building-photo.php angelegt/aktualisiert.
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_helpers.php';

function bp_mime_from_filename(string $fn): string {
    $ext = strtolower(pathinfo($fn, PATHINFO_EXTENSION));
    if ($ext === 'png') {
        return 'image/png';
    }
    if ($ext === 'webp') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

$bid = isset($_GET['building_id']) ? trim((string) $_GET['building_id']) : '';
if ($bid === '' || strlen($bid) > 128) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'building_id fehlt';
    exit;
}

try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    http_response_code(500);
    exit;
}

$st = $pdo->prepare(
    'SELECT filename, moderation_status, user_id FROM building_photos WHERE building_id = :id LIMIT 1'
);
$st->execute([':id' => $bid]);
$row = $st->fetch(PDO::FETCH_ASSOC);
if ($row === false) {
    http_response_code(404);
    exit;
}

$status = (string) ($row['moderation_status'] ?? 'pending');
$fn = (string) $row['filename'];
$owner = $row['user_id'] !== null ? (int) $row['user_id'] : 0;
$uid = auth_user_id_from_request();

$allow = false;
if ($status === 'approved') {
    $allow = true;
} elseif (in_array($status, ['pending', 'rejected'], true) && $uid !== null) {
    if ($owner > 0 && $owner === (int) $uid) {
        $allow = true;
    } elseif (is_photo_moderator((int) $uid)) {
        $allow = true;
    }
}

if (!$allow) {
    http_response_code(403);
    exit;
}

$path = __DIR__ . '/uploads/buildings/' . $fn;
if (!is_file($path) || !preg_match('/^[a-f0-9]{32}\\.(jpg|jpeg|png|webp)$/i', $fn)) {
    http_response_code(404);
    exit;
}

$mime = bp_mime_from_filename($fn);
header('Content-Type: ' . $mime);
header('X-Content-Type-Options: nosniff');
if ($status === 'approved') {
    header('Cache-Control: public, max-age=86400');
} else {
    header('Cache-Control: private, no-store');
}
readfile($path);
