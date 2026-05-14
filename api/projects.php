<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Can-Save: true');
header('X-Save-Method: POST');

$projectsFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'projects.json';
$fieldDefaults = [
    'title' => '',
    'status' => 'unknown',
    'address' => '',
    'summary' => '',
    'description' => '',
    'completion' => '',
    'photo' => '',
    'valuation' => '',
    'developer' => '',
    'contractor' => '',
    'lat' => '',
    'lng' => '',
    'district' => '',
];

function send_json(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

function read_projects_file(string $projectsFile): array
{
    if (!is_file($projectsFile)) {
        throw new RuntimeException('projects.json was not found on the server.');
    }

    $content = file_get_contents($projectsFile);
    if ($content === false) {
        throw new RuntimeException('projects.json could not be read.');
    }

    $decoded = json_decode($content, true);

    if (!is_array($decoded)) {
        throw new RuntimeException('projects.json does not contain a valid JSON array.');
    }

    return $decoded;
}

function normalize_project(array $project, array $fieldDefaults): array
{
    $normalized = $project;

    foreach ($fieldDefaults as $field => $fallback) {
        if (!array_key_exists($field, $project) || trim((string) $project[$field]) === '') {
            $normalized[$field] = $fallback;
            continue;
        }

        $normalized[$field] = (string) $project[$field];
    }

    return $normalized;
}

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method === 'GET') {
        http_response_code(200);
        echo json_encode(read_projects_file($projectsFile), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
        exit;
    }

    if ($method !== 'POST' && $method !== 'PUT') {
        header('Allow: GET, POST, PUT');
        send_json(405, ['error' => 'Method Not Allowed']);
    }

    if ((is_file($projectsFile) && !is_writable($projectsFile)) || (!is_file($projectsFile) && !is_writable(dirname($projectsFile)))) {
        send_json(500, ['error' => 'The server cannot write to projects.json. Check file permissions.']);
    }

    $rawBody = file_get_contents('php://input');
    if ($rawBody === false || trim($rawBody) === '') {
        send_json(400, ['error' => 'The request body was empty.']);
    }

    $decoded = json_decode($rawBody, true);

    if (!is_array($decoded)) {
        send_json(400, ['error' => 'Expected a JSON array of projects.']);
    }

    $normalizedProjects = array_map(
        static fn(array $project): array => normalize_project($project, $fieldDefaults),
        $decoded
    );

    $json = json_encode($normalizedProjects, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        send_json(500, ['error' => 'The server could not encode projects.json.']);
    }

    $written = file_put_contents($projectsFile, $json . "\n", LOCK_EX);
    if ($written === false) {
        send_json(500, ['error' => 'The server could not save projects.json.']);
    }

    send_json(200, ['ok' => true, 'count' => count($normalizedProjects)]);
} catch (Throwable $error) {
    send_json(500, ['error' => $error->getMessage()]);
}
