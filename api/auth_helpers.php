<?php

require_once __DIR__ . '/jwt.php';

function get_app_config(): array {
    return require __DIR__ . '/config.php';
}

function jwt_secret(): string {
    $cfg = get_app_config();
    $s = $cfg['jwt_secret'] ?? '';
    return is_string($s) ? $s : '';
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
