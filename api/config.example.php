<?php
/**
 * Datenbank-Konfiguration für den Altbaufinder.
 * Kopiere diese Datei nach config.php und trage die echten Zugangsdaten ein.
 * config.php ist in .gitignore und wird NICHT ins Repository committed.
 */
return [
    /** MySQL-Host; „localhost“ wird intern zu 127.0.0.1 (TCP), siehe api/db.php */
    'host'        => 'localhost',
    /** Nur nötig, wenn du bewusst per Socket statt TCP verbinden willst: */
    // 'unix_socket' => '/tmp/mysql.sock',
    /** Nur bei abweichendem Port: */
    // 'port'        => 3306,
    'dbname'      => 'altbaufinder',
    'user'        => 'altbaufinder_user',
    'password'    => 'DEIN_PASSWORT',
    'charset'     => 'utf8mb4',
    /**
     * Mindestens 32 zufällige Zeichen für JWT (Login / Registrierung).
     * Alternativ ohne Eintrag hier: Umgebungsvariable ALTBAUFINDER_JWT_SECRET oder JWT_SECRET setzen.
     */
    'jwt_secret'  => 'HIER_LANGEN_ZUFALLSSTRING_EINTRAGEN',
];
