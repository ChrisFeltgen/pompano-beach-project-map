<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require __DIR__ . '/auth.php';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// Keyed by PHP's own detected image type (from the file's actual bytes via
// getimagesize), not whatever extension/MIME the client claims — this is
// what keeps someone from uploading a disguised .php file as "photo.png".
const ALLOWED_TYPES = [
    IMAGETYPE_JPEG => 'jpg',
    IMAGETYPE_PNG => 'png',
    IMAGETYPE_GIF => 'gif',
    IMAGETYPE_WEBP => 'webp',
];

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

    if (!isset($_FILES['photo']) || !is_array($_FILES['photo'])) {
        send_json(400, ['error' => 'No file was uploaded.']);
    }

    $file = $_FILES['photo'];

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_INI_SIZE => 'The file exceeds the server upload size limit.',
            UPLOAD_ERR_FORM_SIZE => 'The file exceeds the allowed upload size.',
            UPLOAD_ERR_PARTIAL => 'The file was only partially uploaded.',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded.',
        ];
        send_json(400, ['error' => $messages[$file['error']] ?? 'Upload failed.']);
    }

    if (!is_uploaded_file($file['tmp_name'])) {
        send_json(400, ['error' => 'Invalid upload.']);
    }

    if ((int) $file['size'] <= 0 || (int) $file['size'] > MAX_UPLOAD_BYTES) {
        send_json(400, ['error' => 'Image must be smaller than 10 MB.']);
    }

    $imageInfo = @getimagesize($file['tmp_name']);
    if ($imageInfo === false || !isset(ALLOWED_TYPES[$imageInfo[2]])) {
        send_json(400, ['error' => 'File must be a JPG, PNG, GIF, or WEBP image.']);
    }

    $extension = ALLOWED_TYPES[$imageInfo[2]];

    // Base the filename on the project name for readability, but never trust
    // it (or the client's original filename) directly — strip to a plain
    // alphanumeric slug and let a random suffix guarantee uniqueness.
    $rawName = isset($_POST['name']) ? (string) $_POST['name'] : '';
    $safeName = preg_replace('/[^A-Za-z0-9]+/', '', $rawName);
    if ($safeName === null || $safeName === '') {
        $safeName = 'Project';
    }
    $safeName = substr($safeName, 0, 60);

    $imagesDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'images';
    if (!is_dir($imagesDir) || !is_writable($imagesDir)) {
        send_json(500, ['error' => 'The server cannot write to the images directory.']);
    }

    $filename = $safeName . '-' . bin2hex(random_bytes(4)) . '.' . $extension;
    $destination = $imagesDir . DIRECTORY_SEPARATOR . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        send_json(500, ['error' => 'The server could not save the uploaded file.']);
    }

    send_json(200, ['ok' => true, 'path' => 'images/' . $filename]);
} catch (Throwable $error) {
    send_json(500, ['error' => $error->getMessage()]);
}
