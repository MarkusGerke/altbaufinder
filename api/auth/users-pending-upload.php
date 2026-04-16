<?php
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

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $st = $pdo->query(
        'SELECT id, email, display_name, created_at FROM users WHERE COALESCE(can_upload_photos, 1) = 0 ORDER BY id ASC LIMIT 200'
    );
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => (int) $r['id'],
            'emailMasked' => mask_email((string) $r['email']),
            'displayName' => isset($r['display_name']) && $r['display_name'] !== ''
                ? (string) $r['display_name']
                : ('Nutzer' . (int) $r['id']),
            'createdAt' => isset($r['created_at']) ? (string) $r['created_at'] : '',
        ];
    }
    echo json_encode(['users' => $out], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Serverfehler', 'detail' => $e->getMessage()]);
}
