<?php

require_once __DIR__ . '/auth_helpers.php';

/**
 * Sendet die Passwort-zurücksetzen-E-Mail per PHP mail().
 *
 * @return bool true wenn mail() ohne Fehler zurückkam
 */
function send_password_reset_email(string $toEmail, string $plainToken): bool {
    $cfg = [];
    try {
        $cfg = get_app_config();
    } catch (Throwable $e) {
        return false;
    }
    $from = isset($cfg['mail_from']) && is_string($cfg['mail_from']) ? trim($cfg['mail_from']) : '';
    $base = isset($cfg['public_app_url']) && is_string($cfg['public_app_url']) ? rtrim(trim($cfg['public_app_url']), '/') : '';
    if ($from === '' || $base === '') {
        return false;
    }

    $link = $base . '/?password-reset=' . rawurlencode($plainToken);
    $subject = 'Altbaufinder: Passwort zurücksetzen';
    $body = "Hallo,\r\n\r\n";
    $body .= "du hast ein neues Passwort für dein Konto angefordert.\r\n\r\n";
    $body .= "Öffne diesen Link im Browser (gültig ca. 1 Stunde):\r\n";
    $body .= $link . "\r\n\r\n";
    $body .= "Wenn du diese E-Mail nicht angefordert hast, kannst du sie ignorieren.\r\n";

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: ' . $from,
    ];

    return @mail($toEmail, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
}

/**
 * Einfache Text-Mail (z. B. Foto-Meldung). Nutzt mail_from aus config.php.
 *
 * @return bool true wenn mail() ohne Fehler zurückkam
 */
function send_plain_text_mail(string $toEmail, string $subject, string $body): bool {
    $cfg = [];
    try {
        $cfg = get_app_config();
    } catch (Throwable $e) {
        return false;
    }
    $from = isset($cfg['mail_from']) && is_string($cfg['mail_from']) ? trim($cfg['mail_from']) : '';
    if ($from === '' || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: ' . $from,
    ];

    return @mail($toEmail, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
}
