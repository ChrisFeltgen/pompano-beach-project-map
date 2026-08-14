<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/authStore.php';
require_once __DIR__ . '/lib/session.php';

/**
 * Gates the admin page and its API endpoints behind a real PHP session —
 * set by login.php after verifying credentials, cleared by api/logout.php.
 * Include this at the very top of any file that needs protecting, before
 * any other output, then call require_admin_auth() explicitly.
 *
 * Returns the authenticated user's public identity ({username, role}) so
 * callers can gate admin-only features (see require_admin_role()) — every
 * account, editor or admin, passes this check; the role only matters for
 * account management itself.
 *
 * $onFail controls what happens when there's no valid session:
 *   'redirect' (default) — for HTML pages (admin.php): sends the browser to
 *     login.php, preserving the current URL as ?next= so login returns here.
 *   'json' — for API endpoints: a fetch() call can't follow that redirect
 *     usefully, so this sends a 401 JSON body instead; admin.js sends the
 *     browser to login.php itself when it sees one.
 */
function require_admin_auth(string $onFail = 'redirect'): array
{
    start_admin_session();

    $user = $_SESSION['user'] ?? null;
    if (is_array($user) && isset($user['username'])) {
        return [
            'username' => (string) $user['username'],
            'role' => normalize_role($user['role'] ?? null),
        ];
    }

    if ($onFail === 'json') {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Authentication required.']) . "\n";
        exit;
    }

    $next = urlencode($_SERVER['REQUEST_URI'] ?? 'admin.php');
    header('Location: login.php?next=' . $next);
    exit;
}

/**
 * Call after require_admin_auth() in any endpoint that only Full Admins
 * (not Editors) should reach — currently just account management.
 */
function require_admin_role(array $currentUser): void
{
    if (($currentUser['role'] ?? 'editor') !== 'admin') {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Only admin accounts can manage users.']) . "\n";
        exit;
    }
}
