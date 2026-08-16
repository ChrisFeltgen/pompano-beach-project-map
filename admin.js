const PROJECT_FIELDS = [
  // Not rendered through the general field grid at all — createPhotoField()
  // builds its own upload-only control next to the photo preview frame (see
  // renderEditor() and the #photoControls container in admin.php). Kept
  // here only so normalizeProject() still gives every project an explicit
  // "photo" key with a "" fallback, same as every other field.
  { key: 'photo', fallback: '' },

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
  { key: 'pzProject', label: 'PZ Project #', fallback: '', section: 'Project Details' },
  { key: 'buildingPermit', label: 'Building Permit #', fallback: '', section: 'Project Details' },
  { key: 'lastUpdated', label: 'Last Updated', fallback: '', type: 'date', section: 'Project Details' },

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
];

// Groups the flat field list into contiguous per-section chunks (fields for
// the same section are always adjacent above) so a section can be rendered
// as a unit — the Location section uses this to lay its fields beside the
// map preview instead of dropping them into the general field grid.
const FIELD_SECTIONS = PROJECT_FIELDS
  .filter((field) => field.key !== 'photo')
  .reduce((sections, field) => {
    const current = sections[sections.length - 1];
    if (current && current.name === field.section) {
      current.fields.push(field);
    } else {
      sections.push({ name: field.section, fields: [field] });
    }
    return sections;
  }, []);

const DATA_FIELDS = PROJECT_FIELDS.filter((field) => !field.virtual);
const fieldKeys = DATA_FIELDS.map((field) => field.key);
const DEFAULT_PROJECT_PHOTO = 'images/project-placeholder.png';
const API_CANDIDATES = ['api/projects.php', 'api/projects'];

// Mirrors script.js's status color/label tables and normalize/label helpers
// so the admin project list reads as the same list as the public map — kept
// in sync by hand since the two pages don't share a JS module.
const STATUS_COLORS = {
  proposed: '#6b7280',
  review: '#2563eb',
  planapproved: '#2563eb',
  permit: '#f97316',
  permitissued: '#f97316',
  construction: '#eab308',
  completed: '#10b981',
  expired: '#dc2626',
  withdrawn: '#7c3aed',
  unknown: '#6b7280',
};

const STATUS_LABELS = {
  proposed: 'Proposed',
  review: 'Site Plan Review',
  planapproved: 'Site Plan Approved',
  permit: 'Building Permit Review',
  permitissued: 'Permit Issued',
  construction: 'Under Construction',
  completed: 'Completed',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  unknown: 'Unknown',
};

function normalizeProjectStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (value === 'proposed') return 'proposed';
  // Check the more specific "approved/issued" phrasing before the broader
  // "site plan"/"permit" substring matches below, since e.g. "Site Plan
  // Approved" would otherwise also match `includes('site plan')`.
  if (value.includes('site plan') && value.includes('approv')) return 'planapproved';
  if (value === 'review' || value.includes('site plan')) return 'review';
  if (value.includes('permit') && (value.includes('issu') || value.includes('approv'))) return 'permitissued';
  if (value === 'permit' || value.includes('building permit')) return 'permit';
  if (value === 'construction' || value.includes('under construction')) return 'construction';
  if (value === 'completed' || value === 'complete') return 'completed';
  if (value === 'expired') return 'expired';
  if (value === 'withdrawn') return 'withdrawn';
  return 'unknown';
}

function getProjectStatusLabel(status, normalizedStatus) {
  const value = String(status || '').trim();
  if (value && value.toLowerCase() !== 'unknown') return value;
  return STATUS_LABELS[normalizedStatus] || STATUS_LABELS.unknown;
}

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
  currentUser: null,
  users: [],
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
const photoControlsEl = document.getElementById('photoControls');
const addButton = document.getElementById('addProject');
const deleteButton = document.getElementById('deleteProject');
const saveButton = document.getElementById('saveProjects');
const exportButton = document.getElementById('exportProjects');
const reloadButton = document.getElementById('reloadProjects');
const cityHeader = document.querySelector('.city-site-header');

const manageUsersButton = document.getElementById('manageUsersButton');
const logoutButton = document.getElementById('logoutButton');
const userManagerModal = document.getElementById('userManagerModal');
const userManagerBackdrop = document.getElementById('userManagerBackdrop');
const userManagerClose = document.getElementById('userManagerClose');
const userManagerStatusEl = document.getElementById('userManagerStatus');
const userManagerListEl = document.getElementById('userManagerList');
const addUserForm = document.getElementById('addUserForm');
const newUserUsernameEl = document.getElementById('newUserUsername');
const newUserPasswordEl = document.getElementById('newUserPassword');
const newUserRoleEl = document.getElementById('newUserRole');

let photoLoadToken = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

// A 401 from any protected endpoint means the session expired (or was
// never valid) mid-use — send the browser to the login page instead of
// just showing an opaque "Authentication required" error inline. Call
// right after a protected fetch resolves, before touching the body.
function redirectToLoginIfSessionExpired(response) {
  if (response.status === 401) {
    window.location.href = `login.php?next=${encodeURIComponent(window.location.pathname)}`;
    return true;
  }
  return false;
}

function getApiUrlCandidates() {
  return API_CANDIDATES.map((path) => new URL(path, window.location.href).toString());
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB, matches the server-side limit

function getUploadUrl() {
  // Derive the upload endpoint from whichever projects API URL actually
  // responded, so it's guaranteed to be the same server/environment rather
  // than re-probing a separate candidate list.
  if (!state.apiUrl) return null;
  if (state.apiUrl.endsWith('projects.php')) return state.apiUrl.replace(/projects\.php$/, 'upload.php');
  if (state.apiUrl.endsWith('projects')) return state.apiUrl.replace(/projects$/, 'upload');
  return null;
}

function getDeletePhotoUrl() {
  if (!state.apiUrl) return null;
  if (state.apiUrl.endsWith('projects.php')) return state.apiUrl.replace(/projects\.php$/, 'delete-photo.php');
  if (state.apiUrl.endsWith('projects')) return state.apiUrl.replace(/projects$/, 'delete-photo');
  return null;
}

// Best-effort: the primary action (clearing the field) already happened by
// the time this is called, so a failure here just leaves an orphaned file
// on the server rather than losing any data — not worth surfacing an error
// over.
async function deletePhotoFromServer(photoPath) {
  const deleteUrl = getDeletePhotoUrl();
  if (!state.canSaveToServer || !deleteUrl || !hasValue(photoPath)) return;

  try {
    await fetch(deleteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: photoPath }),
    });
  } catch {
    // Network hiccup, server unreachable, etc. — nothing more to do here.
  }
}

// Account management only exists on the PHP backend (api/users.php) — the
// Node dev server and the serverless GitHub-backed API have no persisted,
// writable account store to manage. This returns null there, and every
// caller below treats that as "feature unavailable" rather than an error.
function getUsersApiUrl() {
  if (!state.apiUrl || !state.apiUrl.endsWith('projects.php')) return null;
  return state.apiUrl.replace(/projects\.php$/, 'users.php');
}

// admin.php embeds the logged-in user's identity/role as window.__ADMIN_USER__
// (it already knows this server-side, via the session) — no fetch needed,
// and no flash of hidden-then-shown UI while a request would be in flight.
function loadCurrentUser() {
  const user = window.__ADMIN_USER__;
  state.currentUser = user && typeof user.username === 'string' ? user : null;
  manageUsersButton.hidden = !(state.currentUser && state.currentUser.role === 'admin');
}

// Real session logout — api/logout.php destroys the session server-side,
// so (unlike the old Basic Auth version of this app) this actually signs
// you out; a page reload after this will bounce to login.php.
async function handleLogout(event) {
  event.preventDefault();

  if (state.dirty && !window.confirm('You have unsaved changes. Log out anyway?')) {
    return;
  }

  try {
    await fetch('api/logout.php', { method: 'POST', cache: 'no-store' });
  } catch {
    // Ignore — either way we're navigating away next.
  }

  window.location.href = 'index.html';
}

function openUserManager() {
  if (!state.currentUser || state.currentUser.role !== 'admin') return;
  userManagerModal.hidden = false;
  userManagerStatusEl.textContent = '';
  addUserForm.reset();
  loadUserList();
  newUserUsernameEl.focus();
}

function closeUserManager() {
  userManagerModal.hidden = true;
}

async function loadUserList() {
  const usersUrl = getUsersApiUrl();

  if (!usersUrl) {
    userManagerListEl.innerHTML = '';
    userManagerStatusEl.textContent = 'User management is unavailable on this host.';
    return;
  }

  userManagerStatusEl.textContent = 'Loading accounts…';

  try {
    const response = await fetch(usersUrl, { cache: 'no-store' });
    if (redirectToLoginIfSessionExpired(response)) return;
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Failed with status ${response.status}`);
    }

    state.users = Array.isArray(result.users) ? result.users : [];
    renderUserList();
    userManagerStatusEl.textContent = '';
  } catch (error) {
    userManagerStatusEl.textContent = error.message;
  }
}

function renderUserList() {
  userManagerListEl.innerHTML = '';

  state.users.forEach((user) => {
    const isSelf = Boolean(
      state.currentUser && user.username.toLowerCase() === state.currentUser.username.toLowerCase()
    );

    const item = document.createElement('li');
    item.className = 'user-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'user-row__name';
    nameEl.textContent = user.username;
    if (isSelf) {
      const youEl = document.createElement('span');
      youEl.className = 'user-row__you';
      youEl.textContent = ' (you)';
      nameEl.appendChild(youEl);
    }

    const roleSelect = document.createElement('select');
    roleSelect.className = 'user-row__role';
    roleSelect.setAttribute('aria-label', `Account level for ${user.username}`);
    [
      ['editor', 'Editor'],
      ['admin', 'Admin'],
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      roleSelect.appendChild(option);
    });
    roleSelect.value = user.role;
    roleSelect.addEventListener('change', () => {
      updateUserRole(user.username, roleSelect.value, roleSelect, user.role);
    });

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'user-row__reset';
    resetButton.textContent = 'Reset Password';
    resetButton.addEventListener('click', () => resetUserPassword(user.username));

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'user-row__remove danger-action';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeUser(user.username, isSelf));

    item.append(nameEl, roleSelect, resetButton, removeButton);
    userManagerListEl.appendChild(item);
  });

  if (!state.users.length) {
    const empty = document.createElement('li');
    empty.className = 'field-hint';
    empty.textContent = 'No accounts found.';
    userManagerListEl.appendChild(empty);
  }
}

async function updateUserRole(username, role, selectEl, previousRole) {
  const usersUrl = getUsersApiUrl();
  if (!usersUrl) return;

  userManagerStatusEl.textContent = `Updating ${username}…`;

  try {
    const response = await fetch(usersUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role }),
    });
    if (redirectToLoginIfSessionExpired(response)) return;
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Failed with status ${response.status}`);
    }

    state.users = Array.isArray(result.users) ? result.users : state.users;
    userManagerStatusEl.textContent = `${username} is now ${role === 'admin' ? 'an Admin' : 'an Editor'}.`;
    renderUserList();
  } catch (error) {
    userManagerStatusEl.textContent = error.message;
    selectEl.value = previousRole;
  }
}

async function resetUserPassword(username) {
  const usersUrl = getUsersApiUrl();
  if (!usersUrl) return;

  const newPassword = window.prompt(`New password for "${username}" (at least 8 characters):`);
  if (newPassword === null) return;

  if (newPassword.length < 8) {
    userManagerStatusEl.textContent = 'Password must be at least 8 characters.';
    return;
  }

  userManagerStatusEl.textContent = `Updating ${username}…`;

  try {
    const response = await fetch(usersUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: newPassword }),
    });
    if (redirectToLoginIfSessionExpired(response)) return;
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Failed with status ${response.status}`);
    }

    userManagerStatusEl.textContent = `Password updated for ${username}.`;
  } catch (error) {
    userManagerStatusEl.textContent = error.message;
  }
}

async function removeUser(username, isSelf) {
  const usersUrl = getUsersApiUrl();
  if (!usersUrl) return;

  const message = isSelf
    ? `This is your own account — removing it will log you out immediately. Remove "${username}"?`
    : `Remove the account "${username}"? This cannot be undone.`;
  if (!window.confirm(message)) return;

  userManagerStatusEl.textContent = `Removing ${username}…`;

  try {
    const response = await fetch(usersUrl, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (redirectToLoginIfSessionExpired(response)) return;
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Failed with status ${response.status}`);
    }

    state.users = Array.isArray(result.users) ? result.users : state.users;
    userManagerStatusEl.textContent = `Removed ${username}.`;
    renderUserList();
  } catch (error) {
    userManagerStatusEl.textContent = error.message;
  }
}

async function handleAddUserSubmit(event) {
  event.preventDefault();

  const usersUrl = getUsersApiUrl();
  if (!usersUrl) return;

  const username = newUserUsernameEl.value.trim();
  const password = newUserPasswordEl.value;
  const role = newUserRoleEl.value === 'admin' ? 'admin' : 'editor';

  userManagerStatusEl.textContent = 'Adding account…';

  try {
    const response = await fetch(usersUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    if (redirectToLoginIfSessionExpired(response)) return;
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Failed with status ${response.status}`);
    }

    state.users = Array.isArray(result.users) ? result.users : state.users;
    userManagerStatusEl.textContent = `Added "${username}".`;
    addUserForm.reset();
    renderUserList();
  } catch (error) {
    userManagerStatusEl.textContent = error.message;
  }
}

async function uploadProjectPhoto(file, project) {
  const uploadUrl = getUploadUrl();

  if (!state.canSaveToServer || !uploadUrl) {
    throw new Error('Upload requires a connected server.');
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image must be smaller than 10 MB.');
  }

  const formData = new FormData();
  formData.append('photo', file);
  formData.append('name', project?.title || 'project');
  // Lets the server clean up the file this upload is replacing, if any.
  formData.append('oldPhoto', project?.photo || '');

  const response = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (redirectToLoginIfSessionExpired(response)) {
    throw new Error('Your session expired — redirecting to login.');
  }
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.path) {
    throw new Error(result.error || `Upload failed with status ${response.status}`);
  }

  return result.path;
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

// Shared by both the map-click handler and the draggable-marker handler
// below, so picking a pin point always updates the same three things: the
// project state, the visible lat/lng inputs (recreated per render, so they
// have to be looked up live rather than cached), and the preview itself.
function setProjectCoordinates(lat, lng) {
  const project = state.projects[state.selectedIndex];
  if (!project) return;

  const latValue = lat.toFixed(6);
  const lngValue = lng.toFixed(6);

  project.lat = latValue;
  project.lng = lngValue;

  const latInput = document.getElementById('field-lat');
  const lngInput = document.getElementById('field-lng');
  if (latInput) latInput.value = latValue;
  if (lngInput) lngInput.value = lngValue;

  markDirty();
  updateLocationPreview(project);
  renderProjectList();
}

// Wired to the small × button overlaid on the map preview — the counterpart
// to setProjectCoordinates() above, clearing rather than setting the pin.
function clearProjectCoordinates() {
  const project = state.projects[state.selectedIndex];
  if (!project) return;

  project.lat = '';
  project.lng = '';

  const latInput = document.getElementById('field-lat');
  const lngInput = document.getElementById('field-lng');
  if (latInput) latInput.value = '';
  if (lngInput) lngInput.value = '';

  markDirty();
  updateLocationPreview(project);
  renderProjectList();
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
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: true,
  }).setView(POMPANO_CENTER, 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(locationPreviewMap);

  // Only places a *new* pin — once one exists, a stray click shouldn't be
  // able to relocate it (too easy to misclick). Repositioning after that is
  // drag-only, via the marker's own dragend handler in updateLocationPreview.
  locationPreviewMap.on('click', (event) => {
    if (locationPreviewMarker) return;
    setProjectCoordinates(event.latlng.lat, event.latlng.lng);
  });

  // Freshly-inserted containers can report a stale size to Leaflet until the
  // browser finishes layout; nudge it once that settles.
  requestAnimationFrame(() => locationPreviewMap && locationPreviewMap.invalidateSize());
}

function updateLocationPreview(project) {
  if (!locationPreviewMap) return;

  const warningEl = document.getElementById('locationPreviewWarning');
  const clearButton = document.getElementById('locationClearPin');
  const setWarning = (message) => {
    if (!warningEl) return;
    warningEl.hidden = !message;
    warningEl.textContent = message || '';
  };
  const setClearButtonVisible = (visible) => {
    if (clearButton) clearButton.hidden = !visible;
  };

  // Zoom in on first placement, but leave the zoom alone on every update
  // after that (e.g. dragging the marker) — otherwise repositioning a pin
  // while zoomed in past 15 would yank the view back out every time.
  const hadMarker = Boolean(locationPreviewMarker);

  if (locationPreviewMarker) {
    locationPreviewMap.removeLayer(locationPreviewMarker);
    locationPreviewMarker = null;
  }

  const latEntered = hasValue(project?.lat);
  const lngEntered = hasValue(project?.lng);

  if (!latEntered && !lngEntered) {
    setWarning('');
    setClearButtonVisible(false);
    locationPreviewMap.setView(POMPANO_CENTER, 12);
    return;
  }

  if (latEntered !== lngEntered) {
    setWarning('Latitude and Longitude must both be set for the pin to appear on the map.');
    setClearButtonVisible(true);
    locationPreviewMap.setView(POMPANO_CENTER, 12);
    return;
  }

  const lat = toCoordNumber(project.lat);
  const lng = toCoordNumber(project.lng);

  if (!isValidCoordinate(lat, lng)) {
    setWarning('These coordinates look invalid or fall outside the Pompano Beach area — double-check them.');
    setClearButtonVisible(true);
    locationPreviewMap.setView(POMPANO_CENTER, 12);
    return;
  }

  setWarning('');
  setClearButtonVisible(true);
  locationPreviewMarker = L.marker([lat, lng], { draggable: true }).addTo(locationPreviewMap);
  locationPreviewMarker.on('dragend', () => {
    const position = locationPreviewMarker.getLatLng();
    setProjectCoordinates(position.lat, position.lng);
  });

  const currentZoom = locationPreviewMap.getZoom();
  const targetZoom = hadMarker ? currentZoom : Math.max(currentZoom, 15);
  locationPreviewMap.setView([lat, lng], targetZoom);
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
    loadCurrentUser();
    renderAll();
    markDirty(false);
  } catch (error) {
    state.projects = [];
    state.selectedIndex = -1;
    state.apiUrl = null;
    state.canSaveToServer = false;
    state.currentUser = null;
    manageUsersButton.hidden = true;
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
        project.pzProject,
        project.buildingPermit,
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
    const normalizedStatus = normalizeProjectStatus(project.status);
    const statusLabel = getProjectStatusLabel(project.status, normalizedStatus);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-list-item';
    const isActive = index === state.selectedIndex;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-current', String(isActive));
    button.style.setProperty('--status-color', STATUS_COLORS[normalizedStatus] || STATUS_COLORS.unknown);
    button.innerHTML = `
      <span class="project-list-item__body">
        <span class="project-label">${project.title || 'Untitled project'}</span>
        <span class="project-meta">
          <span>${project.address || 'TBD'}</span>
          <span class="project-status-meta">${statusLabel}</span>
        </span>
      </span>
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
    item.className = 'empty-project-result';
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

    // A plain button below the map rather than an overlay on top of it —
    // simpler, and avoids fighting Leaflet's own control/pane stacking.
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.id = 'locationClearPin';
    clearButton.className = 'location-preview-clear';
    clearButton.textContent = 'Remove Pin';
    clearButton.hidden = true;
    clearButton.addEventListener('click', () => clearProjectCoordinates());

    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.textContent = 'Click the map to place a pin. Once set, drag it to reposition — other clicks won’t move it. Use Remove Pin to start over.';

    const warningEl = document.createElement('p');
    warningEl.id = 'locationPreviewWarning';
    warningEl.className = 'field-hint field-hint--warning';
    warningEl.hidden = true;

    group.append(label, mapEl, clearButton, hint, warningEl);
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

    if (field.key === 'title') {
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
    hint.textContent = 'Leave blank until coordinates are available, or click the map preview below to set them.';
    group.appendChild(hint);
  }

  return group;
}

// Photo has no editable text field — it's upload-only, so the server always
// knows the real (validated, non-guessable) path rather than trusting
// whatever an admin might paste into a URL box.
function createPhotoField(project) {
  const group = document.createElement('div');
  group.className = 'field-group field-group--wide';

  const label = document.createElement('label');
  label.textContent = 'Photo';

  const currentPathEl = document.createElement('p');
  currentPathEl.className = 'field-hint photo-current-path';
  currentPathEl.textContent = hasValue(project.photo) ? project.photo : 'No photo set.';

  const controlsWrap = document.createElement('div');
  controlsWrap.className = 'photo-upload';

  const fileInputId = 'field-photo-upload';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = fileInputId;
  fileInput.className = 'photo-upload__input';
  fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp';

  const uploadButton = document.createElement('label');
  uploadButton.setAttribute('for', fileInputId);
  uploadButton.className = 'photo-upload__button';
  uploadButton.textContent = 'Upload Photo…';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'photo-upload__remove';
  removeButton.textContent = 'Remove Photo';
  removeButton.hidden = !hasValue(project.photo);

  const statusEl = document.createElement('span');
  statusEl.className = 'photo-upload__status';

  if (!state.canSaveToServer) {
    fileInput.disabled = true;
    uploadButton.classList.add('is-disabled');
    statusEl.textContent = 'Connect to a server to enable photo uploads.';
  }

  removeButton.addEventListener('click', () => {
    if (!window.confirm('Remove this photo from the project?')) return;

    const oldPhoto = project.photo;
    project.photo = '';
    currentPathEl.textContent = 'No photo set.';
    removeButton.hidden = true;
    statusEl.classList.remove('is-error');
    statusEl.textContent = '';
    markDirty();
    loadEditorPhoto(project);
    renderProjectList();
    deletePhotoFromServer(oldPhoto);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    statusEl.classList.remove('is-error');
    statusEl.textContent = 'Uploading…';

    try {
      const uploadedPath = await uploadProjectPhoto(file, project);
      project.photo = uploadedPath;
      currentPathEl.textContent = uploadedPath;
      removeButton.hidden = false;
      markDirty();
      loadEditorPhoto(project);
      renderProjectList();
      statusEl.textContent = `Uploaded as ${uploadedPath}`;
    } catch (error) {
      statusEl.classList.add('is-error');
      statusEl.textContent = error.message;
    } finally {
      fileInput.value = '';
    }
  });

  controlsWrap.append(fileInput, uploadButton, removeButton, statusEl);
  group.append(label, currentPathEl, controlsWrap);
  return group;
}

// The Location section splits into two columns instead of the general field
// grid: address/district/lat/lng stack in a narrow left column so the map
// preview on the right has room to read as roughly square rather than a
// short, full-width strip.
function renderLocationSection(project, fields) {
  const wrap = document.createElement('div');
  wrap.className = 'location-section';

  const fieldsCol = document.createElement('div');
  fieldsCol.className = 'location-fields-col';

  const mapCol = document.createElement('div');
  mapCol.className = 'location-map-col';

  fields.forEach((field) => {
    const target = field.type === 'map-preview' ? mapCol : fieldsCol;
    target.appendChild(createField(project, field));
  });

  wrap.append(fieldsCol, mapCol);
  return wrap;
}

function renderEditor() {
  const project = state.projects[state.selectedIndex];
  editorFieldsEl.innerHTML = '';
  if (photoControlsEl) photoControlsEl.innerHTML = '';

  if (!project) {
    editorTitleEl.textContent = 'Select a project to edit its JSON fields.';
    editorTitleEl.classList.add('editor-title--empty');
    loadEditorPhoto(null);
    editorFieldsEl.hidden = true;
    editorActionsEl.hidden = true;
    if (photoControlsEl) photoControlsEl.hidden = true;
    return;
  }

  editorTitleEl.textContent = project.title || 'Untitled project';
  editorTitleEl.classList.remove('editor-title--empty');
  loadEditorPhoto(project);
  editorFieldsEl.hidden = false;
  editorActionsEl.hidden = false;

  if (photoControlsEl) {
    photoControlsEl.hidden = false;
    photoControlsEl.appendChild(createPhotoField(project));
  }

  FIELD_SECTIONS.forEach(({ name, fields }) => {
    if (name) {
      const heading = document.createElement('h3');
      heading.className = 'field-section-title';
      heading.textContent = name;
      editorFieldsEl.appendChild(heading);
    }

    if (name === 'Location') {
      editorFieldsEl.appendChild(renderLocationSection(project, fields));
      return;
    }

    fields.forEach((field) => {
      editorFieldsEl.appendChild(createField(project, field));
    });
  });

  initLocationPreviewMap();
  updateLocationPreview(project);
}

function renderAll() {
  renderProjectList();
  renderEditor();
  // When there's no server to save to, "Save Changes" relabels itself to
  // do exactly what this button does — showing both would just be two
  // identically-labeled buttons.
  exportButton.hidden = !state.canSaveToServer;
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

  // Jump straight into renaming "New Project" instead of making the admin
  // hunt for the Title field after every add.
  const titleInput = document.getElementById('field-title');
  if (titleInput) {
    titleInput.focus();
    titleInput.select();
  }
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

// Checks every project, not just whichever one is currently open in the
// editor — the browser's native `required` validation only covers the
// fields actually rendered right now, but Save persists the whole array.
function findFirstUntitledProjectIndex() {
  return state.projects.findIndex((project) => !hasValue(project.title));
}

async function saveProjects() {
  const invalidIndex = findFirstUntitledProjectIndex();
  if (invalidIndex !== -1) {
    state.selectedIndex = invalidIndex;
    renderAll();
    setStatus('Cannot save: every project needs a name. Fix the highlighted project and try again.');
    document.getElementById('field-title')?.focus();
    return;
  }

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
    if (redirectToLoginIfSessionExpired(response)) return;

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

manageUsersButton.addEventListener('click', (event) => {
  event.preventDefault();
  openUserManager();
});
logoutButton.addEventListener('click', handleLogout);
userManagerClose.addEventListener('click', closeUserManager);
userManagerBackdrop.addEventListener('click', closeUserManager);
addUserForm.addEventListener('submit', handleAddUserSubmit);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !userManagerModal.hidden) closeUserManager();
});

updateHeaderHeight();
loadProjects();
