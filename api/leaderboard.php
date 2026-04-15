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

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_helpers.php';

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $sql = '
        SELECT u.id, u.display_name, u.email, COUNT(m.building_id) AS score
        FROM users u
        INNER JOIN user_building_marks m ON m.user_id = u.id
        GROUP BY u.id, u.display_name, u.email
        ORDER BY score DESC
        LIMIT 10
    ';
    $rows = $pdo->query($sql)->fetchAll();
    $rank = 1;
    $out = [];
    foreach ($rows as $row) {
        $name = isset($row['display_name']) && $row['display_name'] !== ''
            ? (string) $row['display_name']
            : mask_email((string) $row['email']);
        $out[] = [
            'rank'        => $rank++,
            'score'       => (int) $row['score'],
            'displayName' => $name,
        ];
    }
    echo json_encode(['leaderboard' => $out]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Highscore nicht verfügbar', 'detail' => $e->getMessage(), 'leaderboard' => []]);
}
