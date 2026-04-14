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

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Eingabe']);
    exit;
}

$token = isset($input['token']) && is_string($input['token']) ? trim($input['token']) : '';
$password = $input['password'] ?? '';

if ($token === '' || strlen($token) < 32) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültiger oder abgelaufener Link']);
    exit;
}

if (!is_string($password) || strlen($password) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'Passwort mindestens 8 Zeichen']);
    exit;
}

$tokenHash = hash('sha256', $token);

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $stmt = $pdo->prepare(
        'SELECT id FROM users WHERE password_reset_token_hash = :h
         AND password_reset_expires_at IS NOT NULL AND password_reset_expires_at > NOW() LIMIT 1'
    );
    $stmt->execute([':h' => $tokenHash]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(400);
        echo json_encode(['error' => 'Ungültiger oder abgelaufener Link']);
        exit;
    }
    $id = (int) $row['id'];
    $newHash = password_hash($password, PASSWORD_DEFAULT);
    $upd = $pdo->prepare(
        'UPDATE users SET password_hash = :ph, password_reset_token_hash = NULL, password_reset_expires_at = NULL WHERE id = :id'
    );
    $upd->execute([':ph' => $newHash, ':id' => $id]);
    echo json_encode(['ok' => true, 'message' => 'Passwort wurde geändert. Du kannst dich jetzt anmelden.'], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Speichern fehlgeschlagen', 'detail' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
