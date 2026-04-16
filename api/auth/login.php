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
require_once __DIR__ . '/../rate_limit.php';

json_security_headers();

$secret = jwt_secret();
if ($secret === '') {
    http_response_code(503);
    echo jwt_config_error_json();
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Eingabe']);
    exit;
}

$email = normalize_email((string) ($input['email'] ?? ''));
$password = $input['password'] ?? '';

if ($email === '' || !is_string($password)) {
    http_response_code(400);
    echo json_encode(['error' => 'E-Mail und Passwort erforderlich']);
    exit;
}

$ip = rate_limit_client_ip();
if (!rate_limit_allow('login', $ip, 40, 3600)) {
    http_response_code(429);
    echo json_encode(['error' => 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $stmt = $pdo->prepare(
        'SELECT id, email, display_name, password_hash, COALESCE(can_upload_photos, 1) AS can_upload_photos FROM users WHERE email = :e LIMIT 1'
    );
    $stmt->execute([':e' => $email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !password_verify($password, $row['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'E-Mail oder Passwort falsch']);
        exit;
    }
    $id = (int) $row['id'];
    $token = jwt_encode(['sub' => $id], $secret);
    echo json_encode([
        'token' => $token,
        'user'  => auth_user_from_db_row($row),
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Anmeldung fehlgeschlagen', 'detail' => $e->getMessage()]);
}
