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
    ensure_users_password_reset_columns($pdo);
    ensure_users_display_name($pdo);
    ensure_users_can_upload_photos($pdo);
}

/** Spalten für Passwort-zurücksetzen (bestehende Installationen per ALTER nachziehen). */
function ensure_users_password_reset_columns(PDO $pdo): void {
    try {
        $pdo->exec('ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(64) NULL AFTER password_hash');
    } catch (Throwable $e) {
        // Spalte existiert vermutlich schon
    }
    try {
        $pdo->exec('ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME NULL AFTER password_reset_token_hash');
    } catch (Throwable $e) {
        // Spalte existiert vermutlich schon
    }
}

/** Deutschsprachige Fantasienamen für fehlenden Anzeigenamen (Architektur-/Stilbegriffe). */
function fantasy_display_name_pool(): array {
    return [
        'Barockgiebel', 'Gründerzeit', 'Jugendstil', 'Sprossenfenster', 'Zierfries',
        'Risalit', 'Erker', 'Dachgaube', 'Stuckkartusche', 'Konsolstein',
        'Sandsteinfassade', 'Zwerchhaus', 'Segmentbogen', 'Schieferdach', 'Voluten',
        'Putzfassade', 'Satteldach', 'Stuckgesims', 'Bauzeit', 'Fassadenband',
        'Klappläden', 'Zwerchgiebel', 'Rundbogen', 'Säulenportal', 'Fensterachse',
        'Dachreiter', 'Mittelrisalit', 'Ziegelrot', 'Stuckrose', 'Giebelfeld',
        'Kaiserstuck', 'Loggia', 'Balkonbrüstung', 'Fassadengliederung',
    ];
}

/** Neue Konten: Upload erst nach Freigabe (1 = erlaubt). Bestehende Installationen: Spalte mit Default 1. */
function ensure_users_can_upload_photos(PDO $pdo): void {
    try {
        $pdo->exec('ALTER TABLE users ADD COLUMN can_upload_photos TINYINT(1) NOT NULL DEFAULT 1');
    } catch (Throwable $e) {
        // Spalte existiert vermutlich schon
    }
}

function user_can_upload_photos(PDO $pdo, int $userId): bool {
    if ($userId < 1) {
        return false;
    }
    ensure_users_can_upload_photos($pdo);
    $st = $pdo->prepare('SELECT COALESCE(can_upload_photos, 1) AS c FROM users WHERE id = :id LIMIT 1');
    $st->execute([':id' => $userId]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    if ($r === false) {
        return false;
    }
    return (int) ($r['c'] ?? 0) === 1;
}

function ensure_users_display_name(PDO $pdo): void {
    try {
        $pdo->exec(
            'ALTER TABLE users ADD COLUMN display_name VARCHAR(64) NULL UNIQUE AFTER email'
        );
    } catch (Throwable $e) {
        // Spalte existiert vermutlich schon
    }
    try {
        $rows = $pdo->query(
            "SELECT id FROM users WHERE display_name IS NULL OR TRIM(display_name) = ''"
        )->fetchAll();
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $name = generate_unique_display_name($pdo);
            $u = $pdo->prepare('UPDATE users SET display_name = :d WHERE id = :id');
            $u->execute([':d' => $name, ':id' => $id]);
        }
    } catch (Throwable $e) {
        // Backfill optional fehlschlagen lassen
    }
}

function generate_unique_display_name(PDO $pdo): string {
    $pool = fantasy_display_name_pool();
    for ($attempt = 0; $attempt < 100; $attempt++) {
        $base = $pool[random_int(0, count($pool) - 1)];
        $candidate = $attempt > 20 ? $base . (string) random_int(10, 99999) : $base;
        if (strlen($candidate) > 64) {
            $candidate = substr($base, 0, 32) . random_int(1000, 99999);
        }
        $chk = $pdo->prepare('SELECT id FROM users WHERE display_name = :d LIMIT 1');
        $chk->execute([':d' => $candidate]);
        if (!$chk->fetch()) {
            return $candidate;
        }
    }
    return 'Mitspieler' . (string) random_int(100000, 999999);
}

/**
 * @return string|null gültiger Anzeigename oder null bei ungültiger Eingabe
 */
function normalize_display_name_input(?string $raw): ?string {
    if ($raw === null) {
        return null;
    }
    $s = trim(preg_replace('/\s+/u', ' ', $raw));
    if ($s === '') {
        return null;
    }
    if (mb_strlen($s) > 48) {
        $s = mb_substr($s, 0, 48);
    }
    if (!preg_match('/^[\p{L}\d _\-.,]+$/u', $s)) {
        return null;
    }
    return $s;
}

/**
 * User-IDs, die Gebäudefotos freigeben oder ablehnen dürfen (config.php: photo_moderator_user_ids
 * oder Umgebung ALTBAUFINDER_PHOTO_MODERATOR_IDS="1,2,3").
 *
 * @return int[]
 */
function photo_moderator_user_ids(): array {
    $out = [];
    try {
        $cfg = get_app_config();
        if (isset($cfg['photo_moderator_user_ids']) && is_array($cfg['photo_moderator_user_ids'])) {
            foreach ($cfg['photo_moderator_user_ids'] as $v) {
                $n = (int) $v;
                if ($n > 0) {
                    $out[] = $n;
                }
            }
        }
    } catch (Throwable $e) {
        // config fehlt
    }
    $env = getenv('ALTBAUFINDER_PHOTO_MODERATOR_IDS');
    if ($env !== false && $env !== '') {
        foreach (explode(',', (string) $env) as $part) {
            $n = (int) trim($part);
            if ($n > 0) {
                $out[] = $n;
            }
        }
    }
    return array_values(array_unique($out));
}

function is_photo_moderator(?int $userId): bool {
    if ($userId === null || $userId < 1) {
        return false;
    }
    return in_array($userId, photo_moderator_user_ids(), true);
}

/**
 * User-IDs, die neue Konten für Foto-Uploads freischalten dürfen (config: account_approver_user_ids
 * oder Umgebung ALTBAUFINDER_ACCOUNT_APPROVER_IDS="1,2").
 *
 * @return int[]
 */
function account_approver_user_ids(): array {
    $out = [];
    try {
        $cfg = get_app_config();
        if (isset($cfg['account_approver_user_ids']) && is_array($cfg['account_approver_user_ids'])) {
            foreach ($cfg['account_approver_user_ids'] as $v) {
                $n = (int) $v;
                if ($n > 0) {
                    $out[] = $n;
                }
            }
        }
    } catch (Throwable $e) {
        // config fehlt
    }
    $env = getenv('ALTBAUFINDER_ACCOUNT_APPROVER_IDS');
    if ($env !== false && $env !== '') {
        foreach (explode(',', (string) $env) as $part) {
            $n = (int) trim($part);
            if ($n > 0) {
                $out[] = $n;
            }
        }
    }
    return array_values(array_unique($out));
}

function is_account_approver(?int $userId): bool {
    if ($userId === null || $userId < 1) {
        return false;
    }
    return in_array($userId, account_approver_user_ids(), true);
}

function json_security_headers(): void {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
}

/** Cloudflare Turnstile: leerer Secret = Prüfung aus (nur Rate-Limit). */
function turnstile_secret(): string {
    try {
        $cfg = get_app_config();
        if (isset($cfg['turnstile_secret']) && is_string($cfg['turnstile_secret'])) {
            $s = trim($cfg['turnstile_secret']);
            if ($s !== '') {
                return $s;
            }
        }
    } catch (Throwable $e) {
        // ignore
    }
    $v = getenv('ALTBAUFINDER_TURNSTILE_SECRET');
    if ($v !== false && trim((string) $v) !== '') {
        return trim((string) $v);
    }
    return '';
}

/**
 * @return true bei Erfolg, false bei fehlendem Token, string bei Netz-/Parse-Fehler (für Logging, nicht an Client)
 */
function turnstile_verify_token(?string $responseToken, string $remoteIp): bool|string {
    $secret = turnstile_secret();
    if ($secret === '') {
        return true;
    }
    if (!is_string($responseToken) || trim($responseToken) === '') {
        return false;
    }
    $body = http_build_query([
        'secret' => $secret,
        'response' => $responseToken,
        'remoteip' => $remoteIp,
    ]);
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body,
            'timeout' => 6,
        ],
    ]);
    $raw = @file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, $ctx);
    if ($raw === false) {
        return 'turnstile_http';
    }
    $j = json_decode($raw, true);
    if (!is_array($j)) {
        return 'turnstile_json';
    }
    return !empty($j['success']);
}

/**
 * Nutzerobjekt für Login/me/Registrierung (JSON).
 *
 * @param array{id:int|string,email:string,display_name?:?string,can_upload_photos?:int|string|null} $row
 * @return array{id:int,email:string,displayName:string,isPhotoModerator:bool,canUploadPhotos:bool,isAccountApprover:bool}
 */
function auth_user_from_db_row(array $row): array {
    $id = (int) $row['id'];
    $dn = isset($row['display_name']) && $row['display_name'] !== ''
        ? (string) $row['display_name']
        : ('Nutzer' . $id);
    $cup = isset($row['can_upload_photos']) ? (int) $row['can_upload_photos'] : 1;
    return [
        'id' => $id,
        'email' => (string) $row['email'],
        'displayName' => $dn,
        'isPhotoModerator' => is_photo_moderator($id),
        'canUploadPhotos' => $cup === 1,
        'isAccountApprover' => is_account_approver($id),
    ];
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
