<?php

/**
 * Einfacher Datei-Rate-Limiter (analog building-photo-report.php).
 *
 * @param string $namespace z. B. 'register', 'login'
 * @param string $key      z. B. Client-IP oder "uid:42"
 * @param int    $max      Max. Treffer im Fenster
 * @param int    $windowSeconds Fensterlänge in Sekunden
 */
function rate_limit_allow(string $namespace, string $key, int $max, int $windowSeconds): bool {
    $dir = sys_get_temp_dir();
    $safeNs = preg_replace('/[^a-z0-9_-]/i', '_', $namespace);
    $safeKey = preg_replace('/[^a-f0-9.:_-]/i', '_', $key);
    $path = $dir . '/altbaufinder_rl_' . $safeNs . '_' . $safeKey . '.json';
    $now = time();
    $times = [];
    if (is_readable($path)) {
        $raw = @file_get_contents($path);
        if ($raw !== false) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && isset($decoded['t']) && is_array($decoded['t'])) {
                foreach ($decoded['t'] as $ts) {
                    if (is_numeric($ts) && $now - (int) $ts < $windowSeconds) {
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

function rate_limit_client_ip(): string {
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($parts[0]);
    }
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'unknown';
}
