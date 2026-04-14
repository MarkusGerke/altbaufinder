<?php

require_once __DIR__ . '/jwt.php';

function get_app_config(): array {
    return require __DIR__ . '/config.php';
}

/** Mindestlänge für JWT-HMAC (Bytes). */
const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Geheimer Schlüssel für JWT: zuerst config.php, sonst Umgebungsvariable ALTBAUFINDER_JWT_SECRET oder JWT_SECRET.
 * Leerstring, wenn nichts Gültiges gesetzt ist.
 */
function jwt_secret(): string {
    $candidates = [];
    try {
        $cfg = get_app_config();
        if (isset($cfg['jwt_secret']) && is_string($cfg['jwt_secret'])) {
            $candidates[] = trim($cfg['jwt_secret']);
        }
    } catch (Throwable $e) {
        // config.php fehlt oder fehlerhaft — nur Env prüfen
    }
    foreach (['ALTBAUFINDER_JWT_SECRET', 'JWT_SECRET'] as $envKey) {
        $v = getenv($envKey);
        if ($v !== false && $v !== '') {
            $candidates[] = trim((string) $v);
        }
    }
    foreach ($candidates as $s) {
        if (strlen($s) >= JWT_SECRET_MIN_LENGTH) {
            return $s;
        }
    }
    return '';
}

/** JSON-Body für 503, wenn jwt_secret fehlt oder zu kurz ist. */
function jwt_config_error_json(): string {
    return json_encode([
        'error' => 'Der Server ist für Anmeldungen noch nicht konfiguriert. Der Administrator muss in api/config.php einen Eintrag jwt_secret setzen (mindestens 32 Zeichen, siehe config.example.php) oder die Umgebungsvariable ALTBAUFINDER_JWT_SECRET bzw. JWT_SECRET setzen.',
    ], JSON_UNESCAPED_UNICODE);
}

/** Authorization: Bearer … */
function auth_bearer_token(): ?string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($h === '' && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $h = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (stripos($h, 'Bearer ') === 0) {
        return trim(substr($h, 7));
    }
    return null;
}

/** @return int|null user id */
function auth_user_id_from_request(): ?int {
    $secret = jwt_secret();
    if ($secret === '') {
        return null;
    }
    $token = auth_bearer_token();
    if ($token === null || $token === '') {
        return null;
    }
    $payload = jwt_decode($token, $secret);
    if ($payload === null || !isset($payload['sub'])) {
        return null;
    }
    $id = (int) $payload['sub'];
    return $id > 0 ? $id : null;
}

function normalize_email(string $email): string {
    return strtolower(trim($email));
}

function ensure_marks_tables(PDO $pdo): void {
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS users (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_users_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS user_building_marks (
            user_id INT UNSIGNED NOT NULL,
            building_id VARCHAR(128) NOT NULL,
            marked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, building_id),
            CONSTRAINT fk_ubm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function mask_email(string $email): string {
    $email = trim($email);
    $at = strpos($email, '@');
    if ($at === false) {
        return '***';
    }
    $local = substr($email, 0, $at);
    $domain = substr($email, $at + 1);
    if ($local === '') {
        return '***@' . $domain;
    }
    $first = $local[0];
    return $first . '***@' . $domain;
}
