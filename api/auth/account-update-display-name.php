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

$uid = auth_user_id_from_request();
if ($uid === null) {
    http_response_code(401);
    echo json_encode(['error' => 'Nicht angemeldet']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Eingabe']);
    exit;
}

$newName = normalize_display_name_input(isset($input['displayName']) ? (string) $input['displayName'] : null);
if ($newName === null) {
    http_response_code(400);
    echo json_encode(['error' => 'Anzeigename: 1–48 Zeichen, Buchstaben, Zahlen, Leerzeichen und . , - _']);
    exit;
}

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $chk = $pdo->prepare('SELECT id FROM users WHERE display_name = :d AND id != :id LIMIT 1');
    $chk->execute([':d' => $newName, ':id' => $uid]);
    if ($chk->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Dieser Anzeigename ist bereits vergeben']);
        exit;
    }
    $stmt = $pdo->prepare('UPDATE users SET display_name = :d WHERE id = :id');
    $stmt->execute([':d' => $newName, ':id' => $uid]);
    $em = $pdo->prepare(
        'SELECT id, email, display_name, COALESCE(can_upload_photos, 1) AS can_upload_photos FROM users WHERE id = :id LIMIT 1'
    );
    $em->execute([':id' => $uid]);
    $row = $em->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(500);
        echo json_encode(['error' => 'Nutzer nicht gefunden']);
        exit;
    }
    echo json_encode(['user' => auth_user_from_db_row($row)], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Speichern fehlgeschlagen', 'detail' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
