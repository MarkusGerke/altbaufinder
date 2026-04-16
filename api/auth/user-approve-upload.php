<?php
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
    echo json_encode(['error' => 'Methode nicht unterstützt']);
    exit;
}

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_helpers.php';

json_security_headers();

$uid = auth_user_id_from_request();
if ($uid === null || !is_account_approver((int) $uid)) {
    http_response_code(403);
    echo json_encode(['error' => 'Keine Berechtigung']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Eingabe']);
    exit;
}

$targetId = isset($input['userId']) ? (int) $input['userId'] : 0;
if ($targetId < 1) {
    http_response_code(400);
    echo json_encode(['error' => 'userId fehlt oder ungültig']);
    exit;
}

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $u = $pdo->prepare('UPDATE users SET can_upload_photos = 1 WHERE id = :id AND COALESCE(can_upload_photos, 1) = 0');
    $u->execute([':id' => $targetId]);
    if ($u->rowCount() < 1) {
        http_response_code(404);
        echo json_encode(['error' => 'Nutzer nicht gefunden oder bereits freigeschaltet']);
        exit;
    }
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Serverfehler', 'detail' => $e->getMessage()]);
}
