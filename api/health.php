<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');
header('Content-Type: text/plain; charset=utf-8');

echo "PHP version: " . phpversion() . "\n";

echo "Loading config...\n";
try {
    require_once __DIR__ . '/db.php';
    echo "db.php loaded OK\n";
} catch (Throwable $e) {
    echo "db.php error: " . $e->getMessage() . "\n";
    exit;
}

echo "Connecting to DB...\n";
try {
    $pdo = getDbConnection();
    echo "DB connected OK\n";
} catch (Throwable $e) {
    echo "DB error: " . $e->getMessage() . "\n";
    exit;
}

echo "Checking table...\n";
try {
    $pdo->query("SELECT 1 FROM classifications LIMIT 1");
    echo "Table 'classifications' exists\n";
} catch (Throwable $e) {
    echo "Table error: " . $e->getMessage() . "\n";
    echo "Attempting CREATE TABLE...\n";
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS classifications (
                building_id VARCHAR(128) NOT NULL PRIMARY KEY,
                classification VARCHAR(32) NULL,
                year_of_construction INT NULL,
                geometry_json LONGTEXT NULL,
                last_modified BIGINT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        echo "CREATE TABLE OK\n";
    } catch (Throwable $e2) {
        echo "CREATE TABLE error: " . $e2->getMessage() . "\n";
    }
}

echo "Checking geometry_json column...\n";
try {
    $cols = $pdo->query("SHOW COLUMNS FROM classifications LIKE 'geometry_json'")->fetchAll();
    echo "geometry_json column: " . (count($cols) > 0 ? "YES" : "NO") . "\n";
} catch (Throwable $e) {
    echo "Column check error: " . $e->getMessage() . "\n";
}

echo "\nAll checks complete.\n";
