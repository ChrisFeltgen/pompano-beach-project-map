const fs = require('fs/promises');
const path = require('path');
const { verifyBasicAuth, hasConfiguredUsers } = require('./lib/adminUsers');

const projectFields = {
  title: '',
  status: 'unknown',
  featured: 'true',
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
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(`${JSON.stringify(data, null, 2)}\n`);
}

function normalizeProject(project = {}) {
  const normalized = { ...project };

  Object.entries(projectFields).forEach(([key, fallback]) => {
    normalized[key] = project[key] === null || project[key] === undefined || String(project[key]).trim() === ''
      ? fallback
      : String(project[key]);
  });

  return normalized;
}

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return null;
  }

  return {
    token,
    owner,
    repo,
    branch: process.env.GITHUB_BRANCH || 'main',
    filePath: process.env.GITHUB_PROJECTS_PATH || 'projects.json',
  };
}

function getContentsUrl(config) {
  const encodedPath = config.filePath.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`;
}

async function fetchGitHubProjects(config) {
  const response = await fetch(getContentsUrl(config), {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'User-Agent': 'pompano-beach-project-map-admin',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub load failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const content = Buffer.from(payload.content || '', 'base64').toString('utf8');
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error('GitHub projects.json did not contain an array.');
  }

  return { data, sha: payload.sha };
}

async function saveGitHubProjects(config, projects) {
  const { sha } = await fetchGitHubProjects(config);
  const content = `${JSON.stringify(projects, null, 2)}\n`;

  const response = await fetch(getContentsUrl(config), {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'pompano-beach-project-map-admin',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `Update projects.json via admin on ${new Date().toISOString()}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      sha,
      branch: config.branch,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub save failed (${response.status}): ${details}`);
  }

  return response.json();
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function readLocalProjects() {
  const filePath = path.join(process.cwd(), 'projects.json');
  const content = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error('projects.json must contain an array.');
  }

  return data;
}

module.exports = async (request, response) => {
  const config = getGitHubConfig();

  try {
    if (request.method === 'GET') {
      response.setHeader('X-Can-Save', config && hasConfiguredUsers() ? 'true' : 'false');
      const projects = config
        ? (await fetchGitHubProjects(config)).data
        : await readLocalProjects();
      sendJson(response, 200, projects);
      return;
    }

    if (request.method === 'PUT') {
      if (!hasConfiguredUsers()) {
        sendJson(response, 501, {
          error: 'Admin accounts are not configured. Set ADMIN_USERS (or ADMIN_USER/ADMIN_PASS).',
        });
        return;
      }

      if (!verifyBasicAuth(request.headers.authorization)) {
        response.setHeader('WWW-Authenticate', 'Basic realm="Pompano Beach Project Map Admin"');
        sendJson(response, 401, { error: 'Authentication required.' });
        return;
      }

      if (!config) {
        sendJson(response, 501, {
          error: 'Hosted saving is not configured. Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.',
        });
        return;
      }

      const body = await readRequestBody(request);
      const payload = JSON.parse(body);

      if (!Array.isArray(payload)) {
        sendJson(response, 400, { error: 'Expected an array of projects.' });
        return;
      }

      const projects = payload.map(normalizeProject);
      await saveGitHubProjects(config, projects);
      sendJson(response, 200, { ok: true, count: projects.length });
      return;
    }

    response.setHeader('Allow', 'GET, PUT');
    sendJson(response, 405, { error: 'Method Not Allowed' });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
};
