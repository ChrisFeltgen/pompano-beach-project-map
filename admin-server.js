const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const projectsFile = path.join(root, 'projects.json');
const port = Number(process.env.PORT || 5174);

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
};

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
  const cleanPathname = pathname === '/admin' ? '/admin.html' : pathname;
  const filePath = path.resolve(root, `.${decodeURIComponent(cleanPathname)}`);

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
    if (url.pathname === '/api/projects') {
      await handleProjectsApi(request, response);
      return;
    }

    await serveStatic(request, response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Project maintenance server running at http://127.0.0.1:${port}/admin.html`);
});
