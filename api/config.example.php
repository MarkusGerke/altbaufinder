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
    /**
     * Passwort vergessen: Absender für mail() und Basis-URL der App (ohne / am Ende).
     */
    'mail_from'      => 'noreply@deine-domain.de',
    'public_app_url' => 'https://deine-domain.de',
    /** Empfänger für „Foto melden“ (optional; sonst hallo@markusgerke.com bzw. Umgebung ALTBAUFINDER_PHOTO_REPORT_TO). */
    'photo_report_to' => 'hallo@markusgerke.com',
    /**
     * Optional: User-IDs (users.id), die Gebäudefotos moderieren dürfen (Freigabe / Ablehnung).
     * Alternativ: Umgebungsvariable ALTBAUFINDER_PHOTO_MODERATOR_IDS="1,2"
     */
    // 'photo_moderator_user_ids' => [1],
    /**
     * Optional: User-IDs (users.id), die neue Konten für Foto-Uploads freischalten dürfen.
     * Alternativ: Umgebungsvariable ALTBAUFINDER_ACCOUNT_APPROVER_IDS="1,2"
     */
    // 'account_approver_user_ids' => [1],
    /**
     * Optional: Cloudflare Turnstile bei der Registrierung (Secret; Site-Key im Frontend VITE_TURNSTILE_SITE_KEY).
     * Alternativ: Umgebungsvariable ALTBAUFINDER_TURNSTILE_SECRET
     */
    // 'turnstile_secret' => '0x…',
    /*
     * Hinweis Datenschutz / Konto-Löschen: Beim Löschen eines Nutzers entfallen die Zeilen in
     * user_building_marks (Scores). Tabelle classifications (Farbklassifikationen pro Gebäude) ist global
     * und bleibt unabhängig vom Konto erhalten.
     */
];
