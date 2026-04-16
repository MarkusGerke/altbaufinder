<?php
/**
 * Foto-Moderation: Freigabe oder Ablehnung (nur konfigurierte Moderator-User-IDs).
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Nur POST']);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_helpers.php';

$uid = auth_user_id_from_request();
if ($uid === null || !is_photo_moderator((int) $uid)) {
    http_response_code(403);
    echo json_encode(['error' => 'Keine Moderations-Berechtigung']);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw !== false ? $raw : '', true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültiger JSON-Body']);
    exit;
}

$bid = isset($body['buildingId']) ? trim((string) $body['buildingId']) : '';
$action = isset($body['action']) ? strtolower(trim((string) $body['action'])) : '';
if ($bid === '' || strlen($bid) > 128) {
    http_response_code(400);
    echo json_encode(['error' => 'buildingId fehlt']);
    exit;
}
if ($action !== 'approve' && $action !== 'reject') {
    http_response_code(400);
    echo json_encode(['error' => 'action muss approve oder reject sein']);
    exit;
}

$newStatus = $action === 'approve' ? 'approved' : 'rejected';

try {
    $pdo = getDbConnection();
    $st = $pdo->prepare(
        'UPDATE building_photos SET moderation_status = :st WHERE building_id = :id LIMIT 1'
    );
    $st->execute([':st' => $newStatus, ':id' => $bid]);
    if ($st->rowCount() < 1) {
        http_response_code(404);
        echo json_encode(['error' => 'Kein Foto für dieses Gebäude']);
        exit;
    }
    echo json_encode(['ok' => true, 'moderationStatus' => $newStatus], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Serverfehler']);
}
