<?php
/**
 * Meldung zu einem freigegebenen Gebäudefoto (E-Mail an Betreiber).
 */
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
    echo json_encode(['error' => 'Nur POST']);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_helpers.php';
require_once __DIR__ . '/mail_send.php';

function report_client_ip(): string {
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($parts[0]);
    }
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'unknown';
}

/** Max. 8 Meldungen pro Stunde und IP (einfacher Datei-Limiter). */
function report_rate_limit_ok(string $ip): bool {
    $dir = sys_get_temp_dir();
    $key = preg_replace('/[^a-f0-9.:_-]/i', '_', $ip);
    $path = $dir . '/altbaufinder_photo_report_' . $key . '.json';
    $now = time();
    $window = 3600;
    $max = 8;
    $times = [];
    if (is_readable($path)) {
        $raw = @file_get_contents($path);
        if ($raw !== false) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && isset($decoded['t']) && is_array($decoded['t'])) {
                foreach ($decoded['t'] as $ts) {
                    if (is_numeric($ts) && $now - (int) $ts < $window) {
                        $times[] = (int) $ts;
                    }
                }
            }
        }
    }
    if (count($times) >= $max) {
        return false;
    }
    $times[] = $now;
    @file_put_contents($path, json_encode(['t' => $times]), LOCK_EX);
    return true;
}

function photo_report_recipient(): string {
    foreach (['ALTBAUFINDER_PHOTO_REPORT_TO', 'PHOTO_REPORT_TO'] as $envKey) {
        $v = getenv($envKey);
        if ($v !== false && trim((string) $v) !== '') {
            return trim((string) $v);
        }
    }
    try {
        $cfg = get_app_config();
        if (isset($cfg['photo_report_to']) && is_string($cfg['photo_report_to']) && trim($cfg['photo_report_to']) !== '') {
            return trim($cfg['photo_report_to']);
        }
    } catch (Throwable $e) {
        // config.php fehlt
    }
    return 'hallo@markusgerke.com';
}

$ip = report_client_ip();

$raw = file_get_contents('php://input');
$body = json_decode($raw !== false ? $raw : '', true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültiger JSON-Body']);
    exit;
}

$bid = isset($body['building_id']) ? trim((string) $body['building_id']) : '';
$message = isset($body['message']) ? trim((string) $body['message']) : '';
if ($bid === '' || strlen($bid) > 128) {
    http_response_code(400);
    echo json_encode(['error' => 'building_id fehlt oder ungültig']);
    exit;
}
if (strlen($message) < 10 || strlen($message) > 4000) {
    http_response_code(400);
    echo json_encode(['error' => 'Nachricht: mindestens 10, maximal 4000 Zeichen']);
    exit;
}

try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Serverfehler']);
    exit;
}

$st = $pdo->prepare(
    'SELECT 1 FROM building_photos WHERE building_id = :id AND moderation_status = :st LIMIT 1'
);
$st->execute([':id' => $bid, ':st' => 'approved']);
if ($st->fetchColumn() === false) {
    http_response_code(404);
    echo json_encode(['error' => 'Kein freigegebenes Foto für dieses Gebäude']);
    exit;
}

if (!report_rate_limit_ok($ip)) {
    http_response_code(429);
    echo json_encode(['error' => 'Zu viele Meldungen. Bitte später erneut versuchen.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$to = photo_report_recipient();
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    http_response_code(503);
    echo json_encode(['error' => 'Meldungen sind derzeit nicht konfiguriert (E-Mail).']);
    exit;
}

$subject = 'Altbaufinder: Gebäudefoto gemeldet';
$bodyMail = "Gebäude-ID: {$bid}\r\n";
$bodyMail .= 'IP (Hinweis): ' . $ip . "\r\n\r\n";
$bodyMail .= "Nachricht:\r\n" . $message . "\r\n";

if (!send_plain_text_mail($to, $subject, $bodyMail)) {
    http_response_code(503);
    echo json_encode(['error' => 'E-Mail konnte nicht gesendet werden (mail_from in config.php prüfen).']);
    exit;
}

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
