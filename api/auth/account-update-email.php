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

$currentPassword = $input['currentPassword'] ?? '';
$newEmail = normalize_email((string) ($input['newEmail'] ?? ''));

if (!is_string($currentPassword) || $currentPassword === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Aktuelles Passwort erforderlich']);
    exit;
}

if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige E-Mail-Adresse']);
    exit;
}

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $stmt = $pdo->prepare('SELECT id, email, display_name, password_hash FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $uid]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($currentPassword, $row['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Aktuelles Passwort falsch']);
        exit;
    }

    $dn = isset($row['display_name']) && $row['display_name'] !== ''
        ? (string) $row['display_name']
        : ('Nutzer' . $uid);

    if (normalize_email($row['email']) === $newEmail) {
        echo json_encode(
            ['user' => ['id' => $uid, 'email' => $newEmail, 'displayName' => $dn]],
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }

    $chk = $pdo->prepare('SELECT id FROM users WHERE email = :e AND id != :id LIMIT 1');
    $chk->execute([':e' => $newEmail, ':id' => $uid]);
    if ($chk->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Diese E-Mail ist bereits vergeben']);
        exit;
    }

    $upd = $pdo->prepare('UPDATE users SET email = :e WHERE id = :id');
    $upd->execute([':e' => $newEmail, ':id' => $uid]);
    echo json_encode(
        ['user' => ['id' => $uid, 'email' => $newEmail, 'displayName' => $dn]],
        JSON_UNESCAPED_UNICODE
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Speichern fehlgeschlagen', 'detail' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
