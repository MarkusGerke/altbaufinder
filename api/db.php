<?php
/**
 * PDO-Verbindung zu MySQL/MariaDB.
 *
 * Hinweis: Unter macOS verbindet PHP bei host=„localhost“ oft per Unix-Socket.
 * Fehlt die Socket-Datei, lautet der Fehler SQLSTATE[HY000] [2002] „No such file or directory“.
 * Deshalb wird „localhost“/„::1“ standardmäßig auf 127.0.0.1 (TCP) abgebildet.
 *
 * Nur Socket nutzen: in config.php z. B. 'unix_socket' => '/tmp/mysql.sock' setzen.
 * Optional: 'port' => 3307
 */
function mysql_dsn_from_config(array $cfg): string {
    $charset = $cfg['charset'] ?? 'utf8mb4';
    $dbname = $cfg['dbname'] ?? '';

    if (!empty($cfg['unix_socket'])) {
        return 'mysql:unix_socket=' . $cfg['unix_socket'] . ';dbname=' . $dbname . ';charset=' . $charset;
    }

    $host = $cfg['host'] ?? '127.0.0.1';
    if ($host === 'localhost' || $host === '::1') {
        $host = '127.0.0.1';
    }

    $dsn = 'mysql:host=' . $host . ';dbname=' . $dbname . ';charset=' . $charset;
    if (isset($cfg['port']) && is_numeric($cfg['port'])) {
        $dsn .= ';port=' . (int) $cfg['port'];
    }

    return $dsn;
}

function getDbConnection(): PDO {
    $cfg = require __DIR__ . '/config.php';
    $dsn = mysql_dsn_from_config($cfg);
    $pdo = new PDO($dsn, $cfg['user'], $cfg['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}
