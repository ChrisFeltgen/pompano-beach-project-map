<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require __DIR__ . '/auth.php';
require __DIR__ . '/lib/photoCleanup.php';
require_admin_auth('json');

function send_json(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method !== 'POST') {
        header('Allow: POST');
        send_json(405, ['error' => 'Method Not Allowed']);
    }

    $rawBody = file_get_contents('php://input');
    $decoded = json_decode($rawBody !== false ? $rawBody : '', true);
    $photoPath = is_array($decoded) ? (string) ($decoded['path'] ?? '') : '';

    $imagesDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'images';
    $deleted = delete_admin_photo($photoPath, $imagesDir);

    send_json(200, ['ok' => true, 'deleted' => $deleted]);
} catch (Throwable $error) {
    send_json(500, ['error' => $error->getMessage()]);
}
