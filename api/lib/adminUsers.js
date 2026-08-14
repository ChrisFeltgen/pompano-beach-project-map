// Shared Basic Auth checker for the Node-based admin endpoints
// (admin-server.js for local dev, api/projects.js for a hosted/serverless
// deploy). Mirrors the multi-account support in api/auth.php, but reads
// accounts from environment variables instead of a config file, since these
// run in places that can't read the gitignored api/auth-config.json.
//
// Configure multiple accounts with ADMIN_USERS as a JSON array:
//   ADMIN_USERS=[{"username":"admin","password":"..."},{"username":"jane","password":"..."}]
// A single legacy ADMIN_USER / ADMIN_PASS pair is still supported as a
// fallback when ADMIN_USERS isn't set.
//
// No role/admin-vs-editor concept here, and no Manage Users support — env
// vars aren't something a running process can persist changes back to.
// That feature is PHP-only; admin.js hides the Manage Users UI wherever
// api/whoami.php and api/users.php aren't reachable.

const crypto = require('crypto');

function getConfiguredUsers() {
  const raw = process.env.ADMIN_USERS;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (user) => user && typeof user.username === 'string' && typeof user.password === 'string'
        );
      }
    } catch {
      // Fall through to the legacy single-account env vars below.
    }
  }

  const legacyUser = process.env.ADMIN_USER;
  const legacyPass = process.env.ADMIN_PASS;

  return legacyUser && legacyPass ? [{ username: legacyUser, password: legacyPass }] : [];
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));

  if (bufA.length !== bufB.length) {
    // Still run a same-cost comparison so failure timing doesn't leak length.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

function parseBasicAuthHeader(header) {
  const match = /^Basic\s+(.+)$/i.exec(header || '');
  if (!match) return null;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');

  return {
    username: separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex),
    password: separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1),
  };
}

function verifyBasicAuth(authorizationHeader) {
  const provided = parseBasicAuthHeader(authorizationHeader);
  if (!provided) return false;

  return getConfiguredUsers().some(
    (user) =>
      timingSafeStringEqual(user.username, provided.username) &&
      timingSafeStringEqual(user.password, provided.password)
  );
}

function hasConfiguredUsers() {
  return getConfiguredUsers().length > 0;
}

module.exports = { verifyBasicAuth, hasConfiguredUsers };
