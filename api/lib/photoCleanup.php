<?php

declare(strict_types=1);

// Shared by api/upload.php (cleaning up a photo a new upload replaces) and
// api/delete-photo.php (the explicit Remove Photo action) — deliberately
// conservative: only ever deletes a file that is unambiguously one of this
// tool's own uploads inside images/, never an external URL, never the
// shared placeholder, and never anything a crafted path could walk outside
// that directory to reach.
function delete_admin_photo(string $photoPath, string $imagesDir): bool
{
    $photoPath = trim($photoPath);
    if ($photoPath === '') {
        return false;
    }

    if (!preg_match('#^images/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|gif|webp))$#i', $photoPath, $matches)) {
        return false;
    }

    $filename = $matches[1];
    if (strcasecmp($filename, 'project-placeholder.png') === 0) {
        return false;
    }

    $realImagesDir = realpath($imagesDir);
    $realTarget = realpath($imagesDir . DIRECTORY_SEPARATOR . $filename);

    if ($realImagesDir === false || $realTarget === false) {
        return false;
    }

    if (strncmp($realTarget, $realImagesDir . DIRECTORY_SEPARATOR, strlen($realImagesDir) + 1) !== 0) {
        return false;
    }

    if (!is_file($realTarget)) {
        return false;
    }

    return @unlink($realTarget);
}
