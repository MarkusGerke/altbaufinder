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
require_once __DIR__ . '/../mail_send.php';

$neutral = [
    'ok'      => true,
    'message' => 'Wenn ein Konto zu dieser E-Mail existiert, erhältst du in Kürze eine Nachricht.',
];

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(200);
    echo json_encode($neutral, JSON_UNESCAPED_UNICODE);
    exit;
}

$email = normalize_email((string) ($input['email'] ?? ''));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(200);
    echo json_encode($neutral, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :e LIMIT 1');
    $stmt->execute([':e' => $email]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(200);
        echo json_encode($neutral, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $plain = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $plain);
    $expires = date('Y-m-d H:i:s', time() + 3600);
    $uid = (int) $row['id'];

    $upd = $pdo->prepare(
        'UPDATE users SET password_reset_token_hash = :h, password_reset_expires_at = :ex WHERE id = :id'
    );
    $upd->execute([':h' => $tokenHash, ':ex' => $expires, ':id' => $uid]);

    send_password_reset_email($email, $plain);
} catch (Throwable $e) {
    // Keine Details preisgeben
}

http_response_code(200);
echo json_encode($neutral, JSON_UNESCAPED_UNICODE);
