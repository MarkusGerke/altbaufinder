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

$uid = auth_user_id_from_request();
if ($uid === null) {
    http_response_code(401);
    echo json_encode(['error' => 'Nicht angemeldet']);
    exit;
}

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $uid]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(401);
        echo json_encode(['error' => 'Nutzer nicht gefunden']);
        exit;
    }
    $cnt = $pdo->prepare('SELECT COUNT(*) AS c FROM user_building_marks WHERE user_id = :id');
    $cnt->execute([':id' => $uid]);
    $score = (int) ($cnt->fetch()['c'] ?? 0);
    echo json_encode([
        'user'  => ['id' => (int) $row['id'], 'email' => $row['email']],
        'score' => $score,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Fehler', 'detail' => $e->getMessage()]);
}
