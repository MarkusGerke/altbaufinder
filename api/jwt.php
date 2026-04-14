<?php

/** Base64url ohne Padding */
function jwt_b64url_encode(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function jwt_b64url_decode(string $str): string {
    $padded = strtr($str, '-_', '+/');
    $pad = strlen($padded) % 4;
    if ($pad) {
        $padded .= str_repeat('=', 4 - $pad);
    }
    $d = base64_decode($padded, true);
    return $d === false ? '' : $d;
}

function jwt_encode(array $payload, string $secret, int $ttlSec = 2592000): string {
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $now = time();
    $payload['iat'] = $now;
    $payload['exp'] = $now + $ttlSec;
    $h = jwt_b64url_encode(json_encode($header, JSON_UNESCAPED_UNICODE));
    $p = jwt_b64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $sig = hash_hmac('sha256', "$h.$p", $secret, true);
    $s = jwt_b64url_encode($sig);
    return "$h.$p.$s";
}

/** @return array|null Payload oder null bei Fehler / abgelaufen */
function jwt_decode(string $token, string $secret): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$h, $p, $s] = $parts;
    $sigBin = jwt_b64url_decode($s);
    if ($sigBin === '') {
        return null;
    }
    $expected = hash_hmac('sha256', "$h.$p", $secret, true);
    if (!hash_equals($expected, $sigBin)) {
        return null;
    }
    $json = jwt_b64url_decode($p);
    $payload = json_decode($json, true);
    if (!is_array($payload)) {
        return null;
    }
    if (($payload['exp'] ?? 0) < time()) {
        return null;
    }
    return $payload;
}
