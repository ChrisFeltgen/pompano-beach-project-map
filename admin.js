const PROJECT_FIELDS = [
  { key: 'title', label: 'Project Name', fallback: '', required: true },
  {
    key: 'status',
    label: 'Status',
    fallback: 'unknown',
    type: 'select',
    options: [
      'Proposed',
      'Site Plan Review',
      'Building Permit Review',
      'Under Construction',
      'Completed',
      'unknown',
    ],
  },
  { key: 'address', label: 'Address', fallback: '' },
  { key: 'district', label: 'District', fallback: '' },
  { key: 'lat', label: 'Latitude', fallback: '' },
  { key: 'lng', label: 'Longitude', fallback: '' },
  { key: 'summary', label: 'Summary', fallback: '', wide: true },
  { key: 'description', label: 'Description', fallback: '', type: 'textarea', wide: true },
  { key: 'completion', label: 'Est. Completion', fallback: '' },
  { key: 'valuation', label: 'Valuation', fallback: '' },
  { key: 'developer', label: 'Developer', fallback: '' },
  { key: 'contractor', label: 'Contractor', fallback: '' },
  { key: 'photo', label: 'Photo', fallback: '', type: 'url', wide: true },
];

const fieldKeys = PROJECT_FIELDS.map((field) => field.key);

const state = {
  projects: [],
  selectedIndex: -1,
  dirty: false,
  canSaveToServer: false,
};

const statusEl = document.getElementById('adminStatus');
const listEl = document.getElementById('adminProjectList');
const countEl = document.getElementById('projectCount');
const searchEl = document.getElementById('projectSearch');
const editorFieldsEl = document.getElementById('editorFields');
const emptyEditorEl = document.getElementById('emptyEditor');
const editorActionsEl = document.getElementById('editorActions');
const addButton = document.getElementById('addProject');
const deleteButton = document.getElementById('deleteProject');
const saveButton = document.getElementById('saveProjects');
const exportButton = document.getElementById('exportProjects');
const reloadButton = document.getElementById('reloadProjects');
const cityHeader = document.querySelector('.city-site-header');

function setStatus(message) {
  statusEl.textContent = message;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function normalizeProject(project = {}) {
  const normalized = {};

  PROJECT_FIELDS.forEach((field) => {
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

  if (!state.canSaveToServer) {
    setStatus('Editing locally. Run the admin server to save directly, or export JSON.');
  } else if (state.dirty) {
    setStatus(`${state.projects.length} projects loaded. Unsaved changes.`);
  } else {
    setStatus(`${state.projects.length} projects loaded. No unsaved changes.`);
  }
}

async function fetchProjects() {
  try {
    const apiResponse = await fetch('/api/projects', { cache: 'no-store' });
    if (!apiResponse.ok) throw new Error(`API returned ${apiResponse.status}`);
    const apiData = await apiResponse.json();
    if (!Array.isArray(apiData)) throw new Error('API did not return an array');
    state.canSaveToServer = true;
    return apiData;
  } catch {
    const staticResponse = await fetch('projects.json', { cache: 'no-store' });
    if (!staticResponse.ok) {
      throw new Error(`Unable to load projects.json: ${staticResponse.status}`);
    }
    const staticData = await staticResponse.json();
    if (!Array.isArray(staticData)) throw new Error('projects.json must contain an array');
    state.canSaveToServer = false;
    return staticData;
  }
}

async function loadProjects() {
  setStatus('Loading projects...');
  saveButton.disabled = true;

  try {
    const projects = await fetchProjects();
    state.projects = projects.map(normalizeProject);
    state.selectedIndex = state.projects.length ? 0 : -1;
    renderAll();
    markDirty(false);
  } catch (error) {
    state.projects = [];
    state.selectedIndex = -1;
    renderAll();
    setStatus(error.message);
  }
}

function getFilteredProjectIndexes() {
  const query = searchEl.value.trim().toLowerCase();
  const indexedProjects = state.projects
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
      ].some((value) => String(value || '').toLowerCase().includes(query));
    })
    .sort((a, b) => String(a.project.title || '').localeCompare(String(b.project.title || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    }))
    .map(({ index }) => index);

  return indexedProjects;
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
  control.value = project[field.key] || '';
  control.className = field.type === 'textarea' ? 'field-textarea' : 'field-control';

  if (field.type === 'select') {
    field.options.forEach((optionValue) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue === 'unknown' ? 'Unknown' : optionValue;
      control.appendChild(option);
    });
  } else if (field.type && field.type !== 'textarea') {
    control.type = field.type;
  } else if (field.type !== 'textarea') {
    control.type = 'text';
  }

  if (field.required) {
    control.required = true;
  }

  control.addEventListener('input', () => {
    state.projects[state.selectedIndex][field.key] = control.value;
    markDirty();
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
    emptyEditorEl.hidden = false;
    editorFieldsEl.hidden = true;
    editorActionsEl.hidden = true;
    return;
  }

  emptyEditorEl.hidden = true;
  editorFieldsEl.hidden = false;
  editorActionsEl.hidden = false;

  PROJECT_FIELDS.forEach((field) => {
    editorFieldsEl.appendChild(createField(project, field));
  });
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
  if (!state.canSaveToServer) {
    downloadProjectsJson();
    return;
  }

  setStatus('Saving projects.json...');
  saveButton.disabled = true;

  try {
    const response = await fetch('/api/projects', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getProjectsForSave()),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Save failed with status ${response.status}`);
    }

    state.projects = getProjectsForSave();
    markDirty(false);
    renderAll();
    setStatus(`${state.projects.length} projects saved to projects.json.`);
  } catch (error) {
    setStatus(error.message);
    markDirty(true);
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
reloadButton.addEventListener('click', loadProjects);

updateHeaderHeight();
loadProjects();
