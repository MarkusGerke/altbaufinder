<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';

try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Datenbankverbindung fehlgeschlagen']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT building_id, classification, year_of_construction, last_modified FROM classifications');
    $rows = $stmt->fetchAll();
    $result = [];
    foreach ($rows as $row) {
        $result[$row['building_id']] = [
            'classification'      => $row['classification'],
            'yearOfConstruction'  => $row['year_of_construction'] !== null ? (int) $row['year_of_construction'] : null,
            'lastModified'        => (int) $row['last_modified'],
        ];
    }
    echo json_encode($result);
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'Ungültige Eingabe']);
        exit;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO classifications (building_id, classification, year_of_construction, last_modified)
         VALUES (:id, :cls, :year, :ts)
         ON DUPLICATE KEY UPDATE classification = :cls2, year_of_construction = :year2, last_modified = :ts2'
    );

    $saved = [];
    foreach ($input as $buildingId => $entry) {
        $cls  = $entry['classification'] ?? null;
        $year = isset($entry['yearOfConstruction']) ? (int) $entry['yearOfConstruction'] : null;
        $ts   = isset($entry['lastModified']) ? (int) $entry['lastModified'] : (int) (microtime(true) * 1000);
        $stmt->execute([
            ':id'    => $buildingId,
            ':cls'   => $cls,
            ':year'  => $year,
            ':ts'    => $ts,
            ':cls2'  => $cls,
            ':year2' => $year,
            ':ts2'   => $ts,
        ]);
        $saved[$buildingId] = true;
    }
    echo json_encode(['saved' => count($saved)]);
    exit;
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Parameter id fehlt']);
        exit;
    }
    $stmt = $pdo->prepare('DELETE FROM classifications WHERE building_id = :id');
    $stmt->execute([':id' => $id]);
    echo json_encode(['deleted' => $stmt->rowCount()]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Methode nicht unterstützt']);
