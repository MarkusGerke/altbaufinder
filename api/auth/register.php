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

$email = normalize_email($input['email'] ?? '');
$password = $input['password'] ?? '';
$requestedName = normalize_display_name_input(isset($input['displayName']) ? (string) $input['displayName'] : null);

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige E-Mail-Adresse']);
    exit;
}

if (!is_string($password) || strlen($password) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'Passwort mindestens 8 Zeichen']);
    exit;
}

try {
    $pdo = getDbConnection();
    ensure_marks_tables($pdo);
    $hash = password_hash($password, PASSWORD_DEFAULT);

    $displayName = $requestedName;
    if ($displayName === null) {
        $displayName = generate_unique_display_name($pdo);
    } else {
        $chk = $pdo->prepare('SELECT id FROM users WHERE display_name = :d LIMIT 1');
        $chk->execute([':d' => $displayName]);
        if ($chk->fetch()) {
            $displayName = $displayName . random_int(1, 99);
            if (strlen($displayName) > 64) {
                $displayName = mb_substr($requestedName, 0, 40) . random_int(10, 99);
            }
            $chk2 = $pdo->prepare('SELECT id FROM users WHERE display_name = :d LIMIT 1');
            $chk2->execute([':d' => $displayName]);
            if ($chk2->fetch()) {
                $displayName = generate_unique_display_name($pdo);
            }
        }
    }

    $stmt = $pdo->prepare('INSERT INTO users (email, display_name, password_hash) VALUES (:e, :dn, :h)');
    $stmt->execute([':e' => $email, ':dn' => $displayName, ':h' => $hash]);
    $id = (int) $pdo->lastInsertId();
    $token = jwt_encode(['sub' => $id], $secret);
    echo json_encode([
        'token' => $token,
        'user'  => [
            'id'          => $id,
            'email'       => $email,
            'displayName' => $displayName,
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    if ($e->getCode() === 23000 || str_contains($e->getMessage(), 'Duplicate')) {
        http_response_code(409);
        echo json_encode(['error' => 'Diese E-Mail ist bereits registriert']);
        exit;
    }
    $msg = $e->getMessage();
    $userMsg = 'Registrierung fehlgeschlagen.';
    if (str_contains($msg, '2002') || str_contains($msg, 'Connection refused') || str_contains($msg, 'denied')) {
        $userMsg = 'Keine Verbindung zur Datenbank. Prüfe, ob MySQL läuft und api/config.php stimmt.';
    } elseif (str_contains($msg, '1049') || str_contains($msg, "Unknown database")) {
        $userMsg = 'Die Datenbank aus config.php existiert nicht.';
    } elseif (str_contains($msg, '1146') || (str_contains($msg, "doesn't exist") && str_contains($msg, 'users'))) {
        $userMsg = 'Datenbank nicht vorbereitet (Tabelle users fehlt). Siehe api/schema.sql bzw. ensure_marks_tables.';
    }
    http_response_code(500);
    echo json_encode(['error' => $userMsg, 'detail' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
