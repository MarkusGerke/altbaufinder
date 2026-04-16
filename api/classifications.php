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
require_once __DIR__ . '/building_use_mapping.php';

function normalize_classification_value(?string $v): ?string {
    if ($v === null || $v === '') {
        return null;
    }
    static $valid = [
        'altbau_gruen' => true,
        'altbau_gelb'  => true,
        'altbau_rot'   => true,
        'kein_altbau'  => true,
    ];
    if (isset($valid[$v])) {
        return $v;
    }
    // Alte 5er-Skala → 3 Stufen (+ kein_altbau unverändert wenn schon gesetzt)
    if ($v === 'stuck_perfekt' || $v === 'stuck_schoen') {
        return 'altbau_gruen';
    }
    if ($v === 'stuck_mittel' || $v === 'stuck_teilweise') {
        return 'altbau_gelb';
    }
    if ($v === 'entstuckt') {
        return 'altbau_rot';
    }
    // Legacy
    if ($v === 'original') {
        return 'altbau_gruen';
    }
    if ($v === 'altbau_entstuckt') {
        return 'altbau_gelb';
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

$hasBuildingUseCol = false;
try {
    $colsBu = $pdo->query("SHOW COLUMNS FROM classifications LIKE 'building_use'")->fetchAll();
    $hasBuildingUseCol = count($colsBu) > 0;
    if (!$hasBuildingUseCol) {
        $pdo->exec('ALTER TABLE classifications ADD COLUMN building_use VARCHAR(64) NULL');
        $hasBuildingUseCol = true;
    }
} catch (Exception $e) {
    // optional
}

// Einmalige Datenmigration: alte Stufen-Strings → altbau_gruen / gelb / rot
try {
    $pdo->exec(
        "UPDATE classifications SET classification = 'altbau_gruen' WHERE classification IN ('stuck_perfekt','stuck_schoen')"
    );
    $pdo->exec(
        "UPDATE classifications SET classification = 'altbau_gelb' WHERE classification IN ('stuck_mittel','stuck_teilweise')"
    );
    $pdo->exec("UPDATE classifications SET classification = 'altbau_rot' WHERE classification = 'entstuckt'");
} catch (Exception $e) {
    // Migration bei Bedarf manuell (siehe api/migrations/)
}

$method = $_SERVER['REQUEST_METHOD'];
$userId = auth_user_id_from_request();

try {
    if ($method === 'GET') {
        $selectGeom = $hasGeomCol ? ', geometry_json' : '';
        $selectBu = $hasBuildingUseCol ? ', building_use' : '';
        $sql = 'SELECT building_id, classification, year_of_construction, last_modified'
            . $selectGeom
            . $selectBu
            . ' FROM classifications';
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
            $bu = null;
            if ($hasBuildingUseCol && isset($row['building_use'])) {
                $bu = normalize_building_use(is_string($row['building_use']) ? $row['building_use'] : null);
            }
            $entry = [
                'classification'     => $cls,
                'yearOfConstruction' => $row['year_of_construction'] !== null ? (int) $row['year_of_construction'] : null,
                'lastModified'       => (int) $row['last_modified'],
                'geometry'           => $geom,
            ];
            if ($hasBuildingUseCol) {
                $entry['buildingUse'] = $bu;
            }
            $result[$row['building_id']] = $entry;
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

        if ($hasGeomCol && $hasBuildingUseCol) {
            $stmt = $pdo->prepare(
                'INSERT INTO classifications (building_id, classification, year_of_construction, geometry_json, building_use, last_modified)
                 VALUES (:id, :cls, :year, :geom, :buse, :ts)
                 ON DUPLICATE KEY UPDATE classification = :cls2, year_of_construction = :year2, geometry_json = :geom2, building_use = :buse2, last_modified = :ts2'
            );
        } elseif ($hasGeomCol) {
            $stmt = $pdo->prepare(
                'INSERT INTO classifications (building_id, classification, year_of_construction, geometry_json, last_modified)
                 VALUES (:id, :cls, :year, :geom, :ts)
                 ON DUPLICATE KEY UPDATE classification = :cls2, year_of_construction = :year2, geometry_json = :geom2, last_modified = :ts2'
            );
        } elseif ($hasBuildingUseCol) {
            $stmt = $pdo->prepare(
                'INSERT INTO classifications (building_id, classification, year_of_construction, building_use, last_modified)
                 VALUES (:id, :cls, :year, :buse, :ts)
                 ON DUPLICATE KEY UPDATE classification = :cls2, year_of_construction = :year2, building_use = :buse2, last_modified = :ts2'
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

            $buse = null;
            if ($hasBuildingUseCol) {
                if (!array_key_exists('buildingUse', $entry)) {
                    $prevStmt = $pdo->prepare('SELECT building_use FROM classifications WHERE building_id = :id LIMIT 1');
                    $prevStmt->execute([':id' => $buildingId]);
                    $prevRow = $prevStmt->fetch(PDO::FETCH_ASSOC);
                    $buse = $prevRow && isset($prevRow['building_use'])
                        ? normalize_building_use(is_string($prevRow['building_use']) ? $prevRow['building_use'] : null)
                        : null;
                } else {
                    $rawBu = $entry['buildingUse'];
                    if ($rawBu === null || $rawBu === '') {
                        $buse = null;
                    } elseif (is_string($rawBu)) {
                        $buse = normalize_building_use($rawBu);
                    }
                }
            }

            $geomJson = null;
            if ($hasGeomCol) {
                if (isset($entry['geometry']) && is_array($entry['geometry'])) {
                    $geomJson = json_encode($entry['geometry'], JSON_UNESCAPED_UNICODE);
                }
            }

            if ($hasGeomCol && $hasBuildingUseCol) {
                $stmt->execute([
                    ':id' => $buildingId, ':cls' => $cls, ':year' => $year,
                    ':geom' => $geomJson, ':buse' => $buse, ':ts' => $ts,
                    ':cls2' => $cls, ':year2' => $year, ':geom2' => $geomJson, ':buse2' => $buse, ':ts2' => $ts,
                ]);
            } elseif ($hasGeomCol) {
                $stmt->execute([
                    ':id' => $buildingId, ':cls' => $cls, ':year' => $year,
                    ':geom' => $geomJson, ':ts' => $ts,
                    ':cls2' => $cls, ':year2' => $year, ':geom2' => $geomJson, ':ts2' => $ts,
                ]);
            } elseif ($hasBuildingUseCol) {
                $stmt->execute([
                    ':id' => $buildingId, ':cls' => $cls, ':year' => $year,
                    ':buse' => $buse, ':ts' => $ts,
                    ':cls2' => $cls, ':year2' => $year, ':buse2' => $buse, ':ts2' => $ts,
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
