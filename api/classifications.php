<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_helpers.php';

function normalize_classification_value(?string $v): ?string {
    if ($v === null || $v === '') {
        return null;
    }
    static $valid = [
        'stuck_perfekt'   => true,
        'stuck_schoen'    => true,
        'stuck_mittel'    => true,
        'stuck_teilweise' => true,
        'entstuckt'       => true,
    ];
    if (isset($valid[$v])) {
        return $v;
    }
    // Legacy → neu
    if ($v === 'original') {
        return 'stuck_perfekt';
    }
    if ($v === 'altbau_entstuckt') {
        return 'stuck_teilweise';
    }
    if ($v === 'kein_altbau') {
        return null;
    }
    return null;
}

try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Datenbankverbindung fehlgeschlagen', 'detail' => $e->getMessage()]);
    exit;
}

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
} catch (Exception $e) {
    // Tabelle existiert vermutlich schon
}

// Bestehende Installationen: ENUM → VARCHAR
try {
    $pdo->exec('ALTER TABLE classifications MODIFY COLUMN classification VARCHAR(32) NULL');
} catch (Exception $e) {
    // bereits VARCHAR oder keine Berechtigung
}

$hasGeomCol = false;
try {
    $cols = $pdo->query("SHOW COLUMNS FROM classifications LIKE 'geometry_json'")->fetchAll();
    $hasGeomCol = count($cols) > 0;
    if (!$hasGeomCol) {
        $pdo->exec('ALTER TABLE classifications ADD COLUMN geometry_json LONGTEXT NULL AFTER year_of_construction');
        $hasGeomCol = true;
    }
} catch (Exception $e) {
    // ohne geometry_json weiter
}

$method = $_SERVER['REQUEST_METHOD'];
$userId = auth_user_id_from_request();

try {
    if ($method === 'GET') {
        $sql = $hasGeomCol
            ? 'SELECT building_id, classification, year_of_construction, last_modified, geometry_json FROM classifications'
            : 'SELECT building_id, classification, year_of_construction, last_modified FROM classifications';
        $stmt = $pdo->query($sql);
        $rows = $stmt->fetchAll();
        $result = [];
        foreach ($rows as $row) {
            $geom = null;
            if ($hasGeomCol && !empty($row['geometry_json'])) {
                $decoded = json_decode($row['geometry_json'], true);
                $geom = is_array($decoded) ? $decoded : null;
            }
            $cls = normalize_classification_value($row['classification']);
            $result[$row['building_id']] = [
                'classification'     => $cls,
                'yearOfConstruction' => $row['year_of_construction'] !== null ? (int) $row['year_of_construction'] : null,
                'lastModified'       => (int) $row['last_modified'],
                'geometry'           => $geom,
            ];
        }
        echo json_encode($result);
        exit;
    }

    if ($method === 'POST') {
        ensure_marks_tables($pdo);
        $markStmt = $pdo->prepare(
            'INSERT IGNORE INTO user_building_marks (user_id, building_id) VALUES (:uid, :bid)'
        );
        $unmarkStmt = $pdo->prepare(
            'DELETE FROM user_building_marks WHERE user_id = :uid AND building_id = :bid'
        );

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            http_response_code(400);
            echo json_encode(['error' => 'Ungültige Eingabe']);
            exit;
        }

        if ($hasGeomCol) {
            $stmt = $pdo->prepare(
                'INSERT INTO classifications (building_id, classification, year_of_construction, geometry_json, last_modified)
                 VALUES (:id, :cls, :year, :geom, :ts)
                 ON DUPLICATE KEY UPDATE classification = :cls2, year_of_construction = :year2, geometry_json = :geom2, last_modified = :ts2'
            );
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO classifications (building_id, classification, year_of_construction, last_modified)
                 VALUES (:id, :cls, :year, :ts)
                 ON DUPLICATE KEY UPDATE classification = :cls2, year_of_construction = :year2, last_modified = :ts2'
            );
        }

        $saved = [];
        foreach ($input as $buildingId => $entry) {
            if (!is_string($buildingId) || $buildingId === '') {
                continue;
            }
            $rawCls = $entry['classification'] ?? null;
            $cls = is_string($rawCls) ? normalize_classification_value($rawCls) : null;
            if ($rawCls !== null && $rawCls !== '' && $cls === null) {
                // ungültiger Klassifikationswert
                continue;
            }
            $year = isset($entry['yearOfConstruction']) ? (int) $entry['yearOfConstruction'] : null;
            $ts = isset($entry['lastModified']) ? (int) $entry['lastModified'] : (int) (microtime(true) * 1000);

            if ($hasGeomCol) {
                $geomJson = null;
                if (isset($entry['geometry']) && is_array($entry['geometry'])) {
                    $geomJson = json_encode($entry['geometry'], JSON_UNESCAPED_UNICODE);
                }
                $stmt->execute([
                    ':id' => $buildingId, ':cls' => $cls, ':year' => $year,
                    ':geom' => $geomJson, ':ts' => $ts,
                    ':cls2' => $cls, ':year2' => $year, ':geom2' => $geomJson, ':ts2' => $ts,
                ]);
            } else {
                $stmt->execute([
                    ':id' => $buildingId, ':cls' => $cls, ':year' => $year, ':ts' => $ts,
                    ':cls2' => $cls, ':year2' => $year, ':ts2' => $ts,
                ]);
            }
            $saved[$buildingId] = true;

            if ($userId !== null) {
                if ($cls !== null) {
                    $markStmt->execute([':uid' => $userId, ':bid' => $buildingId]);
                } else {
                    $unmarkStmt->execute([':uid' => $userId, ':bid' => $buildingId]);
                }
            }
        }
        echo json_encode(['saved' => count($saved)]);
        exit;
    }

    if ($method === 'DELETE') {
        ensure_marks_tables($pdo);
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Parameter id fehlt']);
            exit;
        }
        $pdo->prepare('DELETE FROM user_building_marks WHERE building_id = :bid')->execute([':bid' => $id]);
        $stmt = $pdo->prepare('DELETE FROM classifications WHERE building_id = :id');
        $stmt->execute([':id' => $id]);
        echo json_encode(['deleted' => $stmt->rowCount()]);
        exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Datenbankfehler', 'detail' => $e->getMessage()]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Methode nicht unterstützt']);
