<?php

declare(strict_types=1);

/**
 * Gates the admin page and its API endpoints behind HTTP Basic Auth.
 * Include this at the very top of any file that needs protecting, before
 * any other output (Basic Auth requires setting headers first).
 */
function require_admin_auth(): void
{
    $configFile = __DIR__ . '/auth-config.php';

    if (!is_file($configFile)) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Admin access is not configured on this server.\n";
        echo "Copy api/auth-config.example.php to api/auth-config.php and fill in real credentials.\n";
        exit;
    }

    $config = require $configFile;
    $expectedUser = is_array($config) ? ($config['username'] ?? null) : null;
    $expectedHash = is_array($config) ? ($config['passwordHash'] ?? null) : null;

    if (!$expectedUser || !$expectedHash) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Admin access is misconfigured — auth-config.php is missing username/passwordHash.\n";
        exit;
    }

    $providedUser = $_SERVER['PHP_AUTH_USER'] ?? '';
    $providedPass = $_SERVER['PHP_AUTH_PW'] ?? '';

    $userOk = hash_equals((string) $expectedUser, $providedUser);
    $passOk = $providedPass !== '' && password_verify($providedPass, (string) $expectedHash);

    if (!$userOk || !$passOk) {
        header('WWW-Authenticate: Basic realm="Pompano Beach Project Map Admin"');
        http_response_code(401);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Authentication required.\n";
        exit;
    }
}

require_admin_auth();
