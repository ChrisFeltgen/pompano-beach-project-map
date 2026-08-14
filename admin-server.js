const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verifyBasicAuth, hasConfiguredUsers } = require('./api/lib/adminUsers');
const { deleteAdminPhoto } = require('./api/lib/photoCleanup');

const root = __dirname;
const projectsFile = path.join(root, 'projects.json');
const imagesDir = path.join(root, 'images');
const port = Number(process.env.PORT || 5174);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const projectFields = {
  title: '',
  status: 'unknown',
  address: '',
  summary: '',
  description: '',
  completion: '',
  photo: '',
  valuation: '',
  developer: '',
  contractor: '',
  lat: '',
  lng: '',
  district: '',
  plannerName: '',
  plannerPhone: '',
  plannerEmail: '',
  lastUpdated: '',
};

// Mirrors api/auth.php for local testing, but stays opt-in: set ADMIN_USERS
// (or the legacy ADMIN_USER/ADMIN_PASS pair) to enable it, otherwise the
// local dev server is unprotected for convenience (the real gate is the PHP
// one on the actual host). See api/lib/adminUsers.js for account config.
function checkLocalAdminAuth(request, response) {
  if (!hasConfiguredUsers()) {
    return true;
  }

  if (verifyBasicAuth(request.headers.authorization)) {
    return true;
  }

  response.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Pompano Beach Project Map Admin"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end('Authentication required.\n');
  return false;
}

async function serveAdminPage(request, response) {
  if (!checkLocalAdminAuth(request, response)) return;

  try {
    const content = await fs.promises.readFile(path.join(root, 'admin.php'), 'utf8');
    // Node doesn't execute PHP — strip the leading auth-check tag and serve
    // the rest of the markup as-is, matching what the real PHP host renders
    // once a request is authenticated. admin.php also has one later inline
    // PHP expression (window.__ADMIN_USER__, filled from the session) —
    // there's no session here, so it becomes null, which is also the
    // correct value: it's what keeps the Manage Users button hidden on
    // this backend, same as everywhere else that feature isn't available.
    const html = content
      .replace(/^<\?php[\s\S]*?\?>\s*/, '')
      .replace(/<\?php\s+echo\s+json_encode\(\$currentAdminUser\);\s*\?>/, 'null');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  } catch {
    response.writeHead(404);
    response.end('Not Found');
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Can-Save': 'true',
    'X-Save-Method': 'POST',
  });
  response.end(`${JSON.stringify(data, null, 2)}\n`);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error('Request body is too large'));
        request.destroy();
      }
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function readRequestBuffer(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Upload is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

// Minimal multipart/form-data parser — just enough to pull out the fields a
// browser's FormData actually sends for this form (a file + a couple of text
// fields). Buffer-based throughout so binary image data isn't corrupted by
// string re-encoding.
function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]).trim() : null;
  if (!boundary) {
    throw new Error('Missing multipart boundary');
  }

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(boundaryBuffer);

  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (next === -1) break;

    let chunk = buffer.subarray(start + boundaryBuffer.length, next);
    if (chunk.subarray(0, 2).toString('latin1') === '\r\n') chunk = chunk.subarray(2);
    if (chunk.subarray(-2).toString('latin1') === '\r\n') chunk = chunk.subarray(0, -2);

    const headerEnd = chunk.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const rawHeaders = chunk.subarray(0, headerEnd).toString('utf8');
      const body = chunk.subarray(headerEnd + 4);
      const dispositionMatch = /name="([^"]*)"(?:;\s*filename="([^"]*)")?/i.exec(rawHeaders);

      if (dispositionMatch) {
        parts.push({
          name: dispositionMatch[1],
          filename: dispositionMatch[2] || null,
          data: body,
        });
      }
    }

    start = next;
  }

  return parts;
}

const IMAGE_SIGNATURES = [
  { ext: 'png', test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', test: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')) },
  {
    ext: 'webp',
    test: (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

function detectImageExtension(buffer) {
  // Sniff the file's actual magic bytes rather than trusting the client's
  // claimed filename/content-type — this is what stops someone uploading a
  // disguised .php file as "photo.png".
  const match = IMAGE_SIGNATURES.find((signature) => signature.test(buffer));
  return match ? match.ext : null;
}

function sanitizeBaseName(name) {
  const cleaned = String(name || '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 60);
  return cleaned || 'Project';
}

// Best-effort cleanup of the photo a new upload is replacing. The actual
// deletion (and its safety checks) live in api/lib/photoCleanup.js, shared
// with the /api/delete-photo route's explicit Remove Photo action.
async function deleteOldPhotoIfReplaced(oldPhoto, newPath) {
  const trimmed = String(oldPhoto || '').trim();
  if (!trimmed || trimmed === newPath) return;

  await deleteAdminPhoto(trimmed, imagesDir);
}

async function handleUploadApi(request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'POST' });
    response.end('Method Not Allowed');
    return;
  }

  if (!checkLocalAdminAuth(request, response)) return;

  const contentType = request.headers['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    sendJson(response, 400, { error: 'Expected a multipart/form-data upload.' });
    return;
  }

  let buffer;
  try {
    buffer = await readRequestBuffer(request, MAX_UPLOAD_BYTES + 1024 * 1024);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  let parts;
  try {
    parts = parseMultipart(buffer, contentType);
  } catch {
    sendJson(response, 400, { error: 'Could not parse the upload.' });
    return;
  }

  const filePart = parts.find((part) => part.name === 'photo' && part.filename);
  if (!filePart || !filePart.data || !filePart.data.length) {
    sendJson(response, 400, { error: 'No file was uploaded.' });
    return;
  }

  if (filePart.data.length > MAX_UPLOAD_BYTES) {
    sendJson(response, 400, { error: 'Image must be smaller than 10 MB.' });
    return;
  }

  const extension = detectImageExtension(filePart.data);
  if (!extension) {
    sendJson(response, 400, { error: 'File must be a JPG, PNG, GIF, or WEBP image.' });
    return;
  }

  const namePart = parts.find((part) => part.name === 'name');
  const safeName = sanitizeBaseName(namePart ? namePart.data.toString('utf8') : '');
  const filename = `${safeName}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  const destination = path.join(imagesDir, filename);

  try {
    await fs.promises.mkdir(imagesDir, { recursive: true });
    await fs.promises.writeFile(destination, filePart.data);
  } catch {
    sendJson(response, 500, { error: 'The server could not save the uploaded file.' });
    return;
  }

  const newPath = `images/${filename}`;
  const oldPhotoPart = parts.find((part) => part.name === 'oldPhoto');
  await deleteOldPhotoIfReplaced(oldPhotoPart ? oldPhotoPart.data.toString('utf8') : '', newPath);

  sendJson(response, 200, { ok: true, path: newPath });
}

async function handleDeletePhotoApi(request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'POST' });
    response.end('Method Not Allowed');
    return;
  }

  if (!checkLocalAdminAuth(request, response)) return;

  let payload;
  try {
    const body = await readRequestBody(request);
    payload = JSON.parse(body || '{}');
  } catch {
    sendJson(response, 400, { error: 'Expected a JSON body.' });
    return;
  }

  const deleted = await deleteAdminPhoto(payload && payload.path, imagesDir);
  sendJson(response, 200, { ok: true, deleted });
}

function normalizeProject(project) {
  const normalized = { ...project };

  Object.entries(projectFields).forEach(([key, fallback]) => {
    normalized[key] = project[key] === null || project[key] === undefined || String(project[key]).trim() === ''
      ? fallback
      : String(project[key]);
  });

  return normalized;
}

async function handleProjectsApi(request, response) {
  if (request.method === 'GET') {
    const content = await fs.promises.readFile(projectsFile, 'utf8');
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Can-Save': 'true',
      'X-Save-Method': 'POST',
    });
    response.end(content);
    return;
  }

  if (request.method === 'POST' || request.method === 'PUT') {
    if (!checkLocalAdminAuth(request, response)) return;

    const body = await readRequestBody(request);
    const data = JSON.parse(body);

    if (!Array.isArray(data)) {
      sendJson(response, 400, { error: 'Expected an array of projects.' });
      return;
    }

    const normalized = data.map(normalizeProject);
    await fs.promises.writeFile(projectsFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    sendJson(response, 200, { ok: true, count: normalized.length });
    return;
  }

  response.writeHead(405, { Allow: 'GET, POST, PUT' });
  response.end('Method Not Allowed');
}

function getStaticFilePath(urlPathname) {
  const pathname = urlPathname === '/' ? '/index.html' : urlPathname;
  const filePath = path.resolve(root, `.${decodeURIComponent(pathname)}`);

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

async function serveStatic(request, response, urlPathname) {
  const filePath = getStaticFilePath(urlPathname);

  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const content = await fs.promises.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not Found');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/admin' || url.pathname === '/admin.php' || url.pathname === '/admin.html') {
      await serveAdminPage(request, response);
      return;
    }

    if (url.pathname === '/api/projects') {
      await handleProjectsApi(request, response);
      return;
    }

    if (url.pathname === '/api/upload') {
      await handleUploadApi(request, response);
      return;
    }

    if (url.pathname === '/api/delete-photo') {
      await handleDeletePhotoApi(request, response);
      return;
    }

    await serveStatic(request, response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Project maintenance server running at http://127.0.0.1:${port}/admin`);
});
