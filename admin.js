const PROJECT_FIELDS = [
  { key: 'title', label: 'Project Name', fallback: '', required: true, section: 'Project Details' },
  {
    key: 'status',
    label: 'Status',
    fallback: 'unknown',
    type: 'select',
    section: 'Project Details',
    options: [
      'Proposed',
      'Site Plan Review',
      'Site Plan Approved',
      'Building Permit Review',
      'Permit Issued',
      'Under Construction',
      'Completed',
      'Expired',
      'Withdrawn',
      'unknown',
    ],
  },
  { key: 'summary', label: 'Summary', fallback: '', wide: true, section: 'Project Details' },
  { key: 'description', label: 'Description', fallback: '', type: 'textarea', wide: true, section: 'Project Details' },
  { key: 'completion', label: 'Est. Completion', fallback: '', section: 'Project Details' },
  { key: 'valuation', label: 'Valuation', fallback: '', section: 'Project Details' },

  { key: 'address', label: 'Address', fallback: '', section: 'Location' },
  {
    key: 'district',
    label: 'District',
    fallback: '',
    type: 'select',
    section: 'Location',
    options: ['', 'District 1', 'District 2', 'District 3', 'District 4', 'District 5'],
  },
  { key: 'lat', label: 'Latitude', fallback: '', section: 'Location' },
  { key: 'lng', label: 'Longitude', fallback: '', section: 'Location' },
  { key: '__locationPreview', label: 'Map Preview', type: 'map-preview', wide: true, virtual: true, section: 'Location' },

  { key: 'developer', label: 'Developer', fallback: '', section: 'Team & Contact' },
  { key: 'contractor', label: 'Contractor', fallback: '', section: 'Team & Contact' },
  { key: 'plannerName', label: 'Assigned Planner', fallback: '', section: 'Team & Contact' },
  { key: 'plannerPhone', label: 'Planner Phone', fallback: '', type: 'tel', section: 'Team & Contact' },
  { key: 'plannerEmail', label: 'Planner Email', fallback: '', type: 'email', section: 'Team & Contact' },

  { key: 'photo', label: 'Photo', fallback: '', type: 'url', wide: true, section: 'Media & Metadata' },
  { key: 'lastUpdated', label: 'Last Updated', fallback: '', type: 'date', section: 'Media & Metadata' },
];

const DATA_FIELDS = PROJECT_FIELDS.filter((field) => !field.virtual);
const fieldKeys = DATA_FIELDS.map((field) => field.key);
const DEFAULT_PROJECT_PHOTO = 'images/project-placeholder.png';
const API_CANDIDATES = ['api/projects.php', 'api/projects'];

// Pompano Beach's rough municipal extent, generous enough not to flag real
// edge-of-town projects but tight enough to catch typos, digit transpositions,
// or swapped lat/lng — the same class of bug that used to send unset
// coordinates to the middle of the ocean on the public map.
const POMPANO_CENTER = [26.2421, -80.1248];
const POMPANO_BOUNDS = { minLat: 26.10, maxLat: 26.40, minLng: -80.25, maxLng: -80.00 };

let locationPreviewMap = null;
let locationPreviewMarker = null;

const state = {
  projects: [],
  selectedIndex: -1,
  dirty: false,
  canSaveToServer: false,
  apiUrl: null,
  saveMethod: 'POST',
};

const statusEl = document.getElementById('adminStatus');
const listEl = document.getElementById('adminProjectList');
const countEl = document.getElementById('projectCount');
const searchEl = document.getElementById('projectSearch');
const editorTitleEl = document.getElementById('editorTitle');
const editorFieldsEl = document.getElementById('editorFields');
const editorActionsEl = document.getElementById('editorActions');
const photoFrameEl = document.getElementById('adminPhotoFrame');
const photoEl = document.getElementById('adminProjectPhoto');
const addButton = document.getElementById('addProject');
const deleteButton = document.getElementById('deleteProject');
const saveButton = document.getElementById('saveProjects');
const exportButton = document.getElementById('exportProjects');
const reloadButton = document.getElementById('reloadProjects');
const cityHeader = document.querySelector('.city-site-header');

let photoLoadToken = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function getApiUrlCandidates() {
  return API_CANDIDATES.map((path) => new URL(path, window.location.href).toString());
}

function resolveAssetUrl(assetPath) {
  const path = hasValue(assetPath) ? String(assetPath).trim() : DEFAULT_PROJECT_PHOTO;

  try {
    return new URL(path, window.location.href).toString();
  } catch {
    return path;
  }
}

function normalizeProject(project = {}) {
  const normalized = {};

  DATA_FIELDS.forEach((field) => {
    normalized[field.key] = hasValue(project[field.key])
      ? String(project[field.key])
      : field.fallback;
  });

  Object.keys(project).forEach((key) => {
    if (!fieldKeys.includes(key)) {
      normalized[key] = project[key];
    }
  });

  return normalized;
}

function getProjectsForSave() {
  return state.projects.map(normalizeProject);
}

function updateHeaderHeight() {
  const height = cityHeader ? cityHeader.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty('--header-height', `${height}px`);
}

function markDirty(isDirty = true) {
  state.dirty = isDirty;
  saveButton.disabled = !state.projects.length || !state.canSaveToServer || !state.dirty;
  saveButton.textContent = state.canSaveToServer ? 'Save Changes' : 'Export JSON';

  if (!state.projects.length) {
    setStatus('No projects loaded.');
  } else if (!state.canSaveToServer) {
    setStatus('Direct save is unavailable on this host. Export JSON or enable the server API.');
  } else if (state.dirty) {
    setStatus(`${state.projects.length} projects loaded. Unsaved changes.`);
  } else {
    setStatus(`${state.projects.length} projects loaded. No unsaved changes.`);
  }
}

function setEditorPhotoLoading(isLoading) {
  photoFrameEl?.classList.toggle('is-loading', isLoading);
  photoFrameEl?.setAttribute('aria-busy', String(isLoading));
}

function showEditorPhoto(src, alt) {
  photoEl.src = src;
  photoEl.alt = alt;
}

function loadEditorPhoto(project) {
  const token = ++photoLoadToken;
  const hasProjectPhoto = hasValue(project?.photo);
  const photoSrc = resolveAssetUrl(hasProjectPhoto ? project.photo : DEFAULT_PROJECT_PHOTO);
  const fallbackSrc = resolveAssetUrl(DEFAULT_PROJECT_PHOTO);
  const photoAlt = hasProjectPhoto
    ? `${project.title || 'Project'} photo`
    : 'Project photo placeholder';

  setEditorPhotoLoading(true);

  const loader = new Image();
  loader.onload = () => {
    if (token !== photoLoadToken) return;
    showEditorPhoto(photoSrc, photoAlt);
    setEditorPhotoLoading(false);
  };
  loader.onerror = () => {
    if (token !== photoLoadToken) return;

    if (photoSrc === fallbackSrc) {
      showEditorPhoto(fallbackSrc, 'Project photo placeholder');
      setEditorPhotoLoading(false);
      return;
    }

    const fallbackLoader = new Image();
    fallbackLoader.onload = () => {
      if (token !== photoLoadToken) return;
      showEditorPhoto(fallbackSrc, 'Project photo placeholder');
      setEditorPhotoLoading(false);
    };
    fallbackLoader.onerror = () => {
      if (token !== photoLoadToken) return;
      setEditorPhotoLoading(false);
    };
    fallbackLoader.src = fallbackSrc;
  };
  loader.src = photoSrc;
}

function toCoordNumber(value) {
  // Number('') and Number(null/undefined) evaluate to 0, which would read as
  // a "valid" coordinate and silently point at Null Island. Treat a blank
  // value as unset instead.
  return hasValue(value) ? Number(value) : NaN;
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= POMPANO_BOUNDS.minLat && lat <= POMPANO_BOUNDS.maxLat
    && lng >= POMPANO_BOUNDS.minLng && lng <= POMPANO_BOUNDS.maxLng;
}

function initLocationPreviewMap() {
  const container = document.getElementById('locationPreviewMap');
  if (!container || typeof L === 'undefined') return;

  if (locationPreviewMap) {
    locationPreviewMap.remove();
    locationPreviewMap = null;
    locationPreviewMarker = null;
  }

  locationPreviewMap = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
  }).setView(POMPANO_CENTER, 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(locationPreviewMap);

  // Freshly-inserted containers can report a stale size to Leaflet until the
  // browser finishes layout; nudge it once that settles.
  requestAnimationFrame(() => locationPreviewMap && locationPreviewMap.invalidateSize());
}

function updateLocationPreview(project) {
  if (!locationPreviewMap) return;

  const warningEl = document.getElementById('locationPreviewWarning');
  const setWarning = (message) => {
    if (!warningEl) return;
    warningEl.hidden = !message;
    warningEl.textContent = message || '';
  };

  if (locationPreviewMarker) {
    locationPreviewMap.removeLayer(locationPreviewMarker);
    locationPreviewMarker = null;
  }

  const latEntered = hasValue(project?.lat);
  const lngEntered = hasValue(project?.lng);

  if (!latEntered && !lngEntered) {
    setWarning('');
    locationPreviewMap.setView(POMPANO_CENTER, 12);
    return;
  }

  if (latEntered !== lngEntered) {
    setWarning('Latitude and Longitude must both be set for the pin to appear on the map.');
    locationPreviewMap.setView(POMPANO_CENTER, 12);
    return;
  }

  const lat = toCoordNumber(project.lat);
  const lng = toCoordNumber(project.lng);

  if (!isValidCoordinate(lat, lng)) {
    setWarning('These coordinates look invalid or fall outside the Pompano Beach area — double-check them.');
    locationPreviewMap.setView(POMPANO_CENTER, 12);
    return;
  }

  setWarning('');
  locationPreviewMarker = L.marker([lat, lng]).addTo(locationPreviewMap);
  locationPreviewMap.setView([lat, lng], 15);
}

async function fetchPublishedProjects() {
  const staticResponse = await fetch('projects.json', { cache: 'no-store' });

  if (!staticResponse.ok) {
    throw new Error(`Unable to load projects.json: ${staticResponse.status}`);
  }

  const staticData = await staticResponse.json();

  if (!Array.isArray(staticData)) {
    throw new Error('projects.json must contain an array');
  }

  return staticData;
}

async function fetchProjectsFromApi() {
  const candidates = getApiUrlCandidates();

  for (const apiUrl of candidates) {
    try {
      const response = await fetch(apiUrl, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('API did not return an array');
      }

      state.apiUrl = apiUrl;
      state.canSaveToServer = response.headers.get('X-Can-Save') !== 'false';
      state.saveMethod = response.headers.get('X-Save-Method') || 'POST';
      return data;
    } catch {
      continue;
    }
  }

  throw new Error('No server API is available.');
}

async function fetchProjects() {
  try {
    return await fetchProjectsFromApi();
  } catch {
    state.apiUrl = null;
    state.canSaveToServer = false;
    state.saveMethod = 'POST';
    return fetchPublishedProjects();
  }
}

async function loadProjects() {
  setStatus('Loading projects...');
  saveButton.disabled = true;

  try {
    const projects = await fetchProjects();
    state.projects = projects.map(normalizeProject);
    state.selectedIndex = -1;
    renderAll();
    markDirty(false);
  } catch (error) {
    state.projects = [];
    state.selectedIndex = -1;
    state.apiUrl = null;
    state.canSaveToServer = false;
    renderAll();
    setStatus(error.message);
  }
}

function getFilteredProjectIndexes() {
  const query = searchEl.value.trim().toLowerCase();

  return state.projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => {
      if (!query) return true;

      return [
        project.title,
        project.address,
        project.status,
        project.developer,
        project.contractor,
        project.district,
        project.plannerName,
        project.plannerPhone,
        project.plannerEmail,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    })
    .sort((a, b) => String(a.project.title || '').localeCompare(String(b.project.title || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    }))
    .map(({ index }) => index);
}

function renderProjectList() {
  const indexes = getFilteredProjectIndexes();
  listEl.innerHTML = '';
  countEl.textContent = `${indexes.length} of ${state.projects.length} projects`;

  indexes.forEach((index) => {
    const project = state.projects[index];
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-current', String(index === state.selectedIndex));
    button.innerHTML = `
      <span class="project-list-title">${project.title || 'Untitled project'}</span>
      <span class="project-list-meta">${project.status || 'unknown'} | ${project.address || 'No address'}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedIndex = index;
      renderAll();
    });
    item.appendChild(button);
    listEl.appendChild(item);
  });

  if (!indexes.length) {
    const item = document.createElement('li');
    item.className = 'project-list-meta';
    item.textContent = 'No matching projects.';
    listEl.appendChild(item);
  }
}

function createField(project, field) {
  const group = document.createElement('div');
  group.className = `field-group${field.wide ? ' field-group--wide' : ''}`;

  if (field.type === 'map-preview') {
    const label = document.createElement('label');
    label.textContent = field.label;

    const mapEl = document.createElement('div');
    mapEl.id = 'locationPreviewMap';
    mapEl.className = 'location-preview-map';

    const warningEl = document.createElement('p');
    warningEl.id = 'locationPreviewWarning';
    warningEl.className = 'field-hint field-hint--warning';
    warningEl.hidden = true;

    group.append(label, mapEl, warningEl);
    return group;
  }

  const label = document.createElement('label');
  const inputId = `field-${field.key}`;
  label.setAttribute('for', inputId);
  label.textContent = field.label;

  const control = field.type === 'textarea'
    ? document.createElement('textarea')
    : field.type === 'select'
      ? document.createElement('select')
      : document.createElement('input');

  control.id = inputId;
  control.name = field.key;
  control.className = field.type === 'textarea' ? 'field-textarea' : 'field-control';

  if (field.type === 'select') {
    field.options.forEach((optionValue) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue === 'unknown'
        ? 'Unknown'
        : optionValue === ''
          ? 'Not set'
          : optionValue;
      control.appendChild(option);
    });
    control.value = project[field.key] || field.fallback;
  } else if (field.type && field.type !== 'textarea') {
    control.type = field.type;
    control.value = project[field.key] || '';
  } else if (field.type !== 'textarea') {
    control.type = 'text';
    control.value = project[field.key] || '';
  } else {
    control.value = project[field.key] || '';
  }

  if (field.required) {
    control.required = true;
  }

  control.addEventListener('input', () => {
    state.projects[state.selectedIndex][field.key] = control.value;
    markDirty();

    if (field.key === 'photo' || field.key === 'title') {
      loadEditorPhoto(state.projects[state.selectedIndex]);
    }

    if (field.key === 'lat' || field.key === 'lng') {
      updateLocationPreview(state.projects[state.selectedIndex]);
    }

    renderProjectList();
  });

  group.append(label, control);

  if (field.key === 'lat' || field.key === 'lng') {
    const hint = document.createElement('div');
    hint.className = 'field-hint';
    hint.textContent = 'Leave blank until coordinates are available.';
    group.appendChild(hint);
  }

  return group;
}

function renderEditor() {
  const project = state.projects[state.selectedIndex];
  editorFieldsEl.innerHTML = '';

  if (!project) {
    editorTitleEl.textContent = 'Select a project to edit its JSON fields.';
    editorTitleEl.classList.add('editor-title--empty');
    loadEditorPhoto(null);
    editorFieldsEl.hidden = true;
    editorActionsEl.hidden = true;
    return;
  }

  editorTitleEl.textContent = project.title || 'Untitled project';
  editorTitleEl.classList.remove('editor-title--empty');
  loadEditorPhoto(project);
  editorFieldsEl.hidden = false;
  editorActionsEl.hidden = false;

  let lastSection = null;
  PROJECT_FIELDS.forEach((field) => {
    if (field.section && field.section !== lastSection) {
      const heading = document.createElement('h3');
      heading.className = 'field-section-title';
      heading.textContent = field.section;
      editorFieldsEl.appendChild(heading);
      lastSection = field.section;
    }
    editorFieldsEl.appendChild(createField(project, field));
  });

  initLocationPreviewMap();
  updateLocationPreview(project);
}

function renderAll() {
  renderProjectList();
  renderEditor();
  exportButton.disabled = !state.projects.length;
  deleteButton.disabled = state.selectedIndex < 0;
  saveButton.disabled = !state.projects.length || !state.canSaveToServer || !state.dirty;
}

function addProject() {
  const project = normalizeProject({
    title: 'New Project',
    status: 'unknown',
  });

  state.projects.push(project);
  state.selectedIndex = state.projects.length - 1;
  searchEl.value = '';
  markDirty();
  renderAll();
}

function deleteSelectedProject() {
  const project = state.projects[state.selectedIndex];

  if (!project) return;

  const confirmed = window.confirm(`Delete "${project.title || 'Untitled project'}"?`);

  if (!confirmed) return;

  state.projects.splice(state.selectedIndex, 1);
  state.selectedIndex = Math.min(state.selectedIndex, state.projects.length - 1);
  markDirty();
  renderAll();
}

function downloadProjectsJson() {
  const blob = new Blob([`${JSON.stringify(getProjectsForSave(), null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'projects.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveProjects() {
  if (!state.canSaveToServer || !state.apiUrl) {
    downloadProjectsJson();
    setStatus('Downloaded projects.json — upload it to your server to publish these changes.');
    return;
  }

  setStatus('Saving projects.json...');
  saveButton.disabled = true;

  try {
    const response = await fetch(state.apiUrl, {
      method: state.saveMethod,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getProjectsForSave()),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || `Save failed with status ${response.status}`);
    }

    state.projects = getProjectsForSave();
    markDirty(false);
    renderAll();
    setStatus(`${state.projects.length} projects saved to projects.json.`);
  } catch (error) {
    markDirty(true);
    setStatus(error.message);
  }
}

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

window.addEventListener('resize', updateHeaderHeight);
searchEl.addEventListener('input', renderProjectList);
addButton.addEventListener('click', addProject);
deleteButton.addEventListener('click', deleteSelectedProject);
saveButton.addEventListener('click', saveProjects);
exportButton.addEventListener('click', downloadProjectsJson);
reloadButton.addEventListener('click', () => {
  if (state.dirty && !window.confirm('You have unsaved changes. Reload and discard them?')) {
    return;
  }
  loadProjects();
});

updateHeaderHeight();
loadProjects();
