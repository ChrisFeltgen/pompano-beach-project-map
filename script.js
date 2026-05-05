let projects = [];

const statusColors = {
  proposed: '#6b7280',
  review: '#2563eb',
  permit: '#f97316',
  construction: '#eab308',
  completed: '#10b981',
  unknown: '#6b7280',
};

const statusIcons = {
  proposed: 'images/icons/Icon-Proposed.png',
  review: 'images/icons/Icon-SitePlan.png',
  permit: 'images/icons/Icon-PermitReview.png',
  construction: 'images/icons/Icon-Construction.png',
  completed: 'images/icons/Icon-Complete.png',
  unknown: 'images/icons/Icon-Proposed.png',
};

const markerIconSize = [32, 45];
const markerIconAnchor = [markerIconSize[0] / 2, markerIconSize[1]];
const markerPopupAnchor = [0, -(markerIconSize[1] - 3)];

const statusLabels = {
  proposed: 'Proposed',
  review: 'Site Plan Review',
  permit: 'Building Permit Review',
  construction: 'Under Construction',
  completed: 'Completed',
  unknown: 'Unknown',
};

const DEFAULT_PROJECT_PHOTO = 'images/project-placeholder.png';

function normalizeProjectStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (value === 'proposed') return 'proposed';
  if (value === 'review' || value.includes('site plan')) return 'review';
  if (value === 'permit' || value.includes('building permit')) return 'permit';
  if (value === 'construction' || value.includes('under construction')) return 'construction';
  if (value === 'completed' || value === 'complete') return 'completed';
  return 'unknown';
}

function getProjectStatusLabel(status, normalizedStatus) {
  const value = String(status || '').trim();
  if (value && value.toLowerCase() !== 'unknown') return value;
  return statusLabels[normalizedStatus] || statusLabels.unknown;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function displayValue(value, fallback = 'TBD') {
  return hasValue(value) ? String(value).trim() : fallback;
}

function getProjectPopupText(project) {
  return displayValue(project.summary, displayValue(project.description, 'No summary available.'));
}

const boundaryGeoJson = [[
  [-80.1956115, 26.2093477],
  [-80.1956047, 26.2090706],
  [-80.1915291, 26.2091461],
  [-80.1893176, 26.2091785],
  [-80.1882158, 26.2091937],
  [-80.1882259, 26.2096371],
  [-80.1863645, 26.2096719],
  [-80.1860292, 26.2096394],
  [-80.1857436, 26.2095973],
  [-80.1842224, 26.2091882],
  [-80.1838888, 26.2091088],
  [-80.18321, 26.2090636],
  [-80.1822412, 26.2090669],
  [-80.1766922, 26.2091835],
  [-80.1760028, 26.2092445],
  [-80.1746741, 26.2096594],
  [-80.1740981, 26.2098289],
  [-80.1736525, 26.2098804],
  [-80.1715639, 26.2099309],
  [-80.170772, 26.2099691],
  [-80.1634512, 26.210387],
  [-80.1559929, 26.210819],
  [-80.1517792, 26.2108515],
  [-80.1482225, 26.210838],
  [-80.148039, 26.211671],
  [-80.147979, 26.21192],
  [-80.147329, 26.211781],
  [-80.147128, 26.211725],
  [-80.145531, 26.211219],
  [-80.144223, 26.210699],
  [-80.143334, 26.210396],
  [-80.142692, 26.210211],
  [-80.141899, 26.209983],
  [-80.140868, 26.209704],
  [-80.140298, 26.209551],
  [-80.139736, 26.209404],
  [-80.1387941, 26.2091516],
  [-80.1382486, 26.2090526],
  [-80.1377432, 26.2088589],
  [-80.137364, 26.2087338],
  [-80.1368538, 26.2083184],
  [-80.136418, 26.207792],
  [-80.135612, 26.206954],
  [-80.1350388, 26.2062637],
  [-80.13433, 26.205976],
  [-80.133267, 26.206013],
  [-80.1314982, 26.2061386],
  [-80.130504, 26.206113],
  [-80.12947, 26.206239],
  [-80.12787, 26.206783],
  [-80.126485, 26.20726],
  [-80.125204, 26.207719],
  [-80.124179, 26.208135],
  [-80.123322, 26.208371],
  [-80.122256, 26.208434],
  [-80.121464, 26.208478],
  [-80.1206943, 26.2087568],
  [-80.120253, 26.209313],
  [-80.120072, 26.2099697],
  [-80.120072, 26.210647],
  [-80.1175115, 26.2107203],
  [-80.1175092, 26.2106413],
  [-80.1146813, 26.2107745],
  [-80.1100626, 26.2109045],
  [-80.1100358, 26.2097349],
  [-80.1041879, 26.2098167],
  [-80.1042147, 26.2116672],
  [-80.0983822, 26.2117923],
  [-80.0979634, 26.2116736],
  [-80.0959791, 26.2195857],
  [-80.0955515, 26.219475],
  [-80.0954998, 26.219636],
  [-80.093366, 26.2196578],
  [-80.0934064, 26.2193717],
  [-80.0929126, 26.2192579],
  [-80.0937251, 26.2154749],
  [-80.093708, 26.2148753],
  [-80.0923656, 26.2148922],
  [-80.0922299, 26.2155837],
  [-80.0919989, 26.2167942],
  [-80.0902731, 26.2168028],
  [-80.0883788, 26.2362188],
  [-80.0836772, 26.2553588],
  [-80.0831169, 26.2570117],
  [-80.0827507, 26.2576204],
  [-80.0821608, 26.2579715],
  [-80.0816147, 26.2577861],
  [-80.081335, 26.2580924],
  [-80.0835942, 26.2623745],
  [-80.0856538, 26.2613945],
  [-80.0867081, 26.2614282],
  [-80.0885029, 26.2611785],
  [-80.0885966, 26.261435],
  [-80.0947001, 26.2612069],
  [-80.0996484, 26.2611524],
  [-80.0996368, 26.2612317],
  [-80.0942856, 26.2976628],
  [-80.0989594, 26.2975349],
  [-80.0999146, 26.2975459],
  [-80.1033649, 26.2975],
  [-80.1058861, 26.2974543],
  [-80.1058848, 26.2972968],
  [-80.1059036, 26.2971153],
  [-80.1059639, 26.2969241],
  [-80.1062885, 26.2963314],
  [-80.1064011, 26.2961065],
  [-80.1064565, 26.2958376],
  [-80.1063944, 26.2937199],
  [-80.1080681, 26.2936814],
  [-80.1133266, 26.2751938],
  [-80.1222785, 26.2750676],
  [-80.123643, 26.2749594],
  [-80.1257351, 26.2748824],
  [-80.1274464, 26.2748487],
  [-80.1288552, 26.2748655],
  [-80.1305021, 26.2749329],
  [-80.1331146, 26.2749377],
  [-80.1357902, 26.2748937],
  [-80.1357947, 26.2750604],
  [-80.1478415, 26.2747278],
  [-80.1478452, 26.2748282],
  [-80.1505235, 26.2747881],
  [-80.1581437, 26.2746742],
  [-80.1581458, 26.2744051],
  [-80.1686061, 26.2741484],
  [-80.1683105, 26.2663031],
  [-80.167975, 26.264087],
  [-80.167744, 26.263253],
  [-80.166937, 26.260328],
  [-80.166894, 26.259962],
  [-80.166154, 26.25647],
  [-80.1660897, 26.2546418],
  [-80.16601, 26.251042],
  [-80.1657785, 26.2500809],
  [-80.1646598, 26.2492916],
  [-80.1645409, 26.2489411],
  [-80.1640447, 26.2489466],
  [-80.1639284, 26.24523],
  [-80.1667498, 26.2452411],
  [-80.1667674, 26.2447683],
  [-80.1672599, 26.2447432],
  [-80.167786, 26.243662],
  [-80.168304, 26.242701],
  [-80.169616, 26.240211],
  [-80.175814, 26.232522],
  [-80.1759602, 26.2322011],
  [-80.1761855, 26.2317873],
  [-80.1764215, 26.2311329],
  [-80.1769473, 26.2304688],
  [-80.1776983, 26.2300935],
  [-80.1783205, 26.2295545],
  [-80.1956115, 26.2093477]
]];

const boundaryCoords = boundaryGeoJson[0].map(([lng, lat]) => [lat, lng]);

const map = L.map('map', {
  scrollWheelZoom: true,
}).setView([26.2421, -80.1248], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

const infoPanel = document.getElementById('projectInfoPanel');
const closeInfoPanelButton = document.getElementById('closeInfoPanel');
const projectPhotoFrame = document.getElementById('projectPhotoFrame');
const projectPhoto = document.getElementById('projectPhoto');
const panelProjectName = document.getElementById('panelProjectName');
const projectStatus = document.getElementById('projectStatus');
const panelProjectAddress = document.getElementById('panelProjectAddress');
const projectCompletion = document.getElementById('projectCompletion');
const projectValuation = document.getElementById('projectValuation');
const projectDeveloper = document.getElementById('projectDeveloper');
const projectContractor = document.getElementById('projectContractor');
const projectDistrict = document.getElementById('projectDistrict');
const projectDescription = document.getElementById('projectDescription');
const imageModal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');
const modalCaption = document.getElementById('modalCaption');
const modalClose = document.getElementById('modalClose');
const cityHeader = document.querySelector('.city-site-header');
const mobileLayoutQuery = window.matchMedia('(max-width: 992px)');

let activeProject = null;
let activeMarker = null;
let photoLoadToken = 0;

const boundaryPolygon = L.polygon(boundaryCoords, {
  color: '#1e40af',
  weight: 3,
  opacity: 0.9,
  fill: false,
}).addTo(map);

L.polygon([
  [
    [90, -180],
    [90, 180],
    [-90, 180],
    [-90, -180],
  ],
  boundaryCoords,
], {
  color: '#000',
  fillColor: '#000',
  fillOpacity: 0.25,
  weight: 0,
  fillRule: 'evenodd',
  interactive: false,
}).addTo(map);

map.fitBounds(boundaryPolygon.getBounds(), { padding: [40, 40] });

function updateHeaderHeight() {
  const height = cityHeader ? cityHeader.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty('--header-height', `${height}px`);
}

updateHeaderHeight();
window.addEventListener('resize', updateHeaderHeight);

function setProjectPhotoLoading(isLoading) {
  projectPhotoFrame?.classList.toggle('is-loading', isLoading);
  projectPhotoFrame?.setAttribute('aria-busy', String(isLoading));
  projectPhoto.style.cursor = isLoading ? 'default' : projectPhoto.style.cursor;
}

function clearProjectPhoto() {
  projectPhoto.removeAttribute('src');
  projectPhoto.alt = '';
  projectPhoto.style.cursor = 'default';
}

function loadProjectPhoto(project) {
  const token = ++photoLoadToken;
  const photoSrc = project.photo || DEFAULT_PROJECT_PHOTO;
  const photoAlt = project.photo ? `${project.title} photo` : 'Project photo placeholder';
  const showLoadedPhoto = (src, alt, isProjectPhoto) => {
    if (token !== photoLoadToken) return;

    projectPhoto.src = src;
    projectPhoto.alt = alt;
    projectPhoto.style.cursor = isProjectPhoto ? 'pointer' : 'default';
    setProjectPhotoLoading(false);
  };
  const showPhotoUnavailable = () => {
    if (token !== photoLoadToken) return;

    clearProjectPhoto();
    setProjectPhotoLoading(false);
  };

  clearProjectPhoto();
  setProjectPhotoLoading(true);

  const loader = new Image();
  loader.onload = () => showLoadedPhoto(photoSrc, photoAlt, Boolean(project.photo));
  loader.onerror = () => {
    if (photoSrc === DEFAULT_PROJECT_PHOTO) {
      showPhotoUnavailable();
      return;
    }

    const fallbackLoader = new Image();
    fallbackLoader.onload = () => showLoadedPhoto(DEFAULT_PROJECT_PHOTO, 'Project photo placeholder', false);
    fallbackLoader.onerror = showPhotoUnavailable;
    fallbackLoader.src = DEFAULT_PROJECT_PHOTO;
  };
  loader.src = photoSrc;
}

function openInfoPanel(project) {
  activeProject = project;
  loadProjectPhoto(project);
  panelProjectName.textContent = displayValue(project.title, 'Unknown project');
  projectStatus.textContent = project.statusLabel || statusLabels.unknown;
  panelProjectAddress.textContent = displayValue(project.address);
  projectCompletion.textContent = displayValue(project.completion);
  projectValuation.textContent = displayValue(project.valuation);
  projectDeveloper.textContent = displayValue(project.developer);
  projectContractor.textContent = displayValue(project.contractor);
  projectDistrict.textContent = displayValue(project.district);
  projectDescription.textContent = displayValue(project.description);
  projectStatus.style.setProperty('--status-color', statusColors[project.status] || statusColors.unknown);
  document.body.classList.add('info-panel-open');
  infoPanel.classList.add('open');
  infoPanel.setAttribute('aria-hidden', 'false');
}

function closeInfoPanel() {
  infoPanel.classList.remove('open');
  infoPanel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('info-panel-open');
  if (activeMarker) {
    activeMarker.closePopup();
    activeMarker = null;
  }
}

function openImageModal() {
  if (!activeProject || projectPhotoFrame?.classList.contains('is-loading') || !projectPhoto.currentSrc) return;
  modalImage.src = projectPhoto.currentSrc || projectPhoto.src;
  modalCaption.textContent = activeProject.title || 'Project image';
  imageModal.classList.add('open');
  imageModal.setAttribute('aria-hidden', 'false');
}

function closeImageModal() {
  imageModal.classList.remove('open');
  imageModal.setAttribute('aria-hidden', 'true');
  modalImage.src = '';
}

closeInfoPanelButton.addEventListener('click', closeInfoPanel);
projectPhoto.addEventListener('click', openImageModal);
modalClose.addEventListener('click', closeImageModal);
imageModal.addEventListener('click', (event) => {
  if (event.target === imageModal || event.target.classList.contains('image-modal__backdrop')) {
    closeImageModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (imageModal.classList.contains('open')) {
      closeImageModal();
    } else {
      closeInfoPanel();
    }
  }
});

function createMarker(project) {
  const icon = L.icon({
    iconUrl: statusIcons[project.status] || statusIcons.unknown,
    iconSize: markerIconSize,
    iconAnchor: markerIconAnchor,
    popupAnchor: markerPopupAnchor,
    className: 'project-marker-icon',
  });

  const marker = L.marker(project.coords, { icon }).bindPopup(`
    <strong>${project.title}</strong><br />
    <em>${project.statusLabel}</em><br />
    <span>${getProjectPopupText(project)}</span>`, {
    autoPan: false,
  });

  marker.project = project;
  marker.on('mouseover', () => marker.openPopup());
  marker.on('mouseout', () => {
    if (marker !== activeMarker || !infoPanel.classList.contains('open')) {
      marker.closePopup();
    }
  });
  marker.on('click', () => focusProject(project, marker));
  return marker;
}

let markers = [];

function getInfoPanelOffsetX() {
  if (getComputedStyle(infoPanel).display === 'none') return 0;
  if (mobileLayoutQuery.matches) return 0;

  const mapRect = map.getContainer().getBoundingClientRect();
  const panelRect = infoPanel.getBoundingClientRect();
  const mapWidth = map.getSize().x;
  const coveredWidth = Math.max(0, mapRect.right - panelRect.left);
  return coveredWidth < mapWidth ? coveredWidth / 2 : 0;
}

function getInfoPanelOffsetY() {
  if (!mobileLayoutQuery.matches || !document.body.classList.contains('map-expanded-open')) return 0;
  if (!infoPanel.classList.contains('open')) return 0;

  const mapRect = map.getContainer().getBoundingClientRect();
  const panelRect = infoPanel.getBoundingClientRect();
  const mapHeight = map.getSize().y;
  const panelTop = Math.max(0, panelRect.top - mapRect.top);

  if (panelTop <= 0 || panelTop >= mapHeight) return 0;

  const topMargin = 12;
  const lowerPinNudge = 18;
  const preferredPinY = Math.max(markerIconSize[1] + topMargin, (panelTop / 2) + lowerPinNudge);
  const maxPinY = Math.max(topMargin, panelTop - topMargin);
  const targetPinY = Math.min(preferredPinY, maxPinY);

  return Math.max(0, (mapHeight / 2) - targetPinY);
}

function getPanelAdjustedCenter(coords, zoom) {
  const offsetX = getInfoPanelOffsetX();
  const offsetY = getInfoPanelOffsetY();
  if (!offsetX && !offsetY) return coords;

  const point = map.project(coords, zoom);
  return map.unproject([point.x + offsetX, point.y + offsetY], zoom);
}

function afterInfoPanelOpen(callback) {
  if (!infoPanel.classList.contains('open')) {
    requestAnimationFrame(callback);
    return;
  }

  const transitionDuration = Number.parseFloat(getComputedStyle(infoPanel).transitionDuration) || 0;
  if (!transitionDuration) {
    requestAnimationFrame(callback);
    return;
  }

  let didRun = false;
  const run = () => {
    if (didRun) return;
    didRun = true;
    infoPanel.removeEventListener('transitionend', onTransitionEnd);
    callback();
  };

  const onTransitionEnd = (event) => {
    if (event.target === infoPanel && event.propertyName === 'transform') {
      run();
    }
  };

  infoPanel.addEventListener('transitionend', onTransitionEnd);
  window.setTimeout(run, (transitionDuration * 1000) + 80);
}

function setActiveMarker(marker) {
  if (activeMarker && activeMarker !== marker) {
    activeMarker.closePopup();
  }

  activeMarker = marker || null;

  if (activeMarker) {
    activeMarker.openPopup();
  }
}

function focusProject(project, marker = markers.find((m) => m.project === project)) {
  const wasOpen = infoPanel.classList.contains('open');
  openInfoPanel(project);

  if (Array.isArray(project.coords) && project.coords.length === 2) {
    const zoom = 15;
    const centerProject = () => {
      map.flyTo(getPanelAdjustedCenter(project.coords, zoom), zoom, { duration: 0.9 });
      setActiveMarker(marker);
    };

    if (wasOpen) {
      requestAnimationFrame(centerProject);
    } else {
      afterInfoPanelOpen(centerProject);
    }
  } else {
    setActiveMarker(marker);
  }
}

function initProjectData() {
  markers = projects
    .filter((project) => Array.isArray(project.coords) && project.coords.length === 2)
    .map(createMarker);

  markers.forEach((marker) => marker.addTo(markerLayer));
  applyFilter('all');
}

const projectList = document.getElementById('projectList');
const filterButtons = document.querySelectorAll('[data-filter]');
const projectSearch = document.getElementById('projectSearch');
const clearProjectSearch = document.getElementById('clearProjectSearch');
const filterMenu = document.getElementById('filterMenu');
const currentStatusFilter = document.getElementById('currentStatusFilter');
const mapLegend = document.querySelector('.map-legend');
const mapWrapper = document.querySelector('.map-wrapper');
const mapSizeToggle = document.getElementById('mapSizeToggle');
let activeStatusFilter = 'all';

function getStatusFilterLabel(status) {
  return status === 'all' ? 'All' : statusLabels[status] || statusLabels.unknown;
}

function syncFilterMenuState() {
  if (!filterMenu) return;
  filterMenu.open = false;
}

function syncLegendState() {
  if (!mapLegend) return;
  mapLegend.open = !mobileLayoutQuery.matches;
}

function closeFilterMenuOnMobile() {
  if (filterMenu && mobileLayoutQuery.matches) {
    filterMenu.open = false;
  }
}

if (typeof mobileLayoutQuery.addEventListener === 'function') {
  mobileLayoutQuery.addEventListener('change', syncFilterMenuState);
  mobileLayoutQuery.addEventListener('change', syncLegendState);
} else if (typeof mobileLayoutQuery.addListener === 'function') {
  mobileLayoutQuery.addListener(syncFilterMenuState);
  mobileLayoutQuery.addListener(syncLegendState);
}

syncFilterMenuState();
syncLegendState();

function setMapExpanded(isExpanded) {
  if (!mapWrapper || !mapSizeToggle) return;

  mapWrapper.classList.toggle('map-wrapper--expanded', isExpanded);
  document.body.classList.toggle('map-expanded-open', isExpanded);
  mapSizeToggle.setAttribute('aria-expanded', String(isExpanded));
  mapSizeToggle.textContent = isExpanded ? 'Smaller map' : 'Larger map';

  requestAnimationFrame(() => map.invalidateSize());
}

function syncMapSizeToggleState() {
  if (!mobileLayoutQuery.matches) {
    setMapExpanded(false);
  }
}

if (mapSizeToggle) {
  mapSizeToggle.addEventListener('click', () => {
    setMapExpanded(!mapWrapper.classList.contains('map-wrapper--expanded'));
  });
}

if (typeof mobileLayoutQuery.addEventListener === 'function') {
  mobileLayoutQuery.addEventListener('change', syncMapSizeToggleState);
} else if (typeof mobileLayoutQuery.addListener === 'function') {
  mobileLayoutQuery.addListener(syncMapSizeToggleState);
}

function normalizeProjectCoords(project) {
  if (Array.isArray(project.coords) && project.coords.length === 2) {
    const [lat, lng] = project.coords.map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }

  const lat = Number(project.lat);
  const lng = Number(project.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

fetch('projects.json')
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load projects.json: ${response.status}`);
    }
    return response.json();
  })
  .then((data) => {
    projects = data
      .map((project) => ({
        ...project,
        status: normalizeProjectStatus(project.status || project.type),
        statusLabel: getProjectStatusLabel(
          project.status || project.type,
          normalizeProjectStatus(project.status || project.type)
        ),
        type: project.type || getProjectStatusLabel(
          project.status,
          normalizeProjectStatus(project.status)
        ),
        summary: displayValue(project.summary, ''),
        description: displayValue(project.description, ''),
        completion: displayValue(project.completion, ''),
        developer: displayValue(project.developer, ''),
        contractor: displayValue(project.contractor, ''),
        photo: displayValue(project.photo, ''),
        coords: normalizeProjectCoords(project),
      }))
      .sort((a, b) => displayValue(a.title, '').localeCompare(displayValue(b.title, ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      }));
    initProjectData();
  })
  .catch((error) => {
    console.error(error);
    projectList.innerHTML = '<li>Unable to load project data.</li>';
  });

function renderProjectList(filteredProjects) {
  projectList.innerHTML = '';
  if (!filteredProjects.length) {
    const item = document.createElement('li');
    item.className = 'empty-project-result';
    item.textContent = 'No matching projects.';
    projectList.appendChild(item);
    return;
  }

  filteredProjects.forEach((project) => {
    const item = document.createElement('li');
    item.innerHTML = `
      <div class="project-label">${project.title}</div>
      <div class="project-meta">
        <span>${project.address || 'TBD'}</span>
        <span class="project-status-meta">${project.statusLabel || statusLabels.unknown}</span>
      </div>
    `;
    item.addEventListener('click', () => {
      const marker = markers.find((m) => m.project === project);
      focusProject(project, marker);
    });
    projectList.appendChild(item);
  });
}

function getSearchText(project) {
  return [
    project.title,
    project.address,
    project.statusLabel,
    project.summary,
    project.description,
    project.valuation,
    project.developer,
    project.contractor,
    project.district,
  ].join(' ').toLowerCase();
}

function applyFilter(status = activeStatusFilter) {
  activeStatusFilter = status;
  currentStatusFilter.textContent = getStatusFilterLabel(activeStatusFilter);
  markerLayer.clearLayers();

  const query = projectSearch.value.trim().toLowerCase();
  const filtered = projects.filter((project) => {
    const matchesStatus = activeStatusFilter === 'all' || project.status === activeStatusFilter;
    const matchesSearch = !query || getSearchText(project).includes(query);
    return matchesStatus && matchesSearch;
  });

  filtered.forEach((project) => {
    const marker = markers.find((m) => m.project === project);
    if (marker) marker.addTo(markerLayer);
  });

  renderProjectList(filtered);
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
    applyFilter(button.dataset.filter);
    closeFilterMenuOnMobile();
  });
});

projectSearch.addEventListener('input', () => applyFilter());

clearProjectSearch.addEventListener('click', () => {
  projectSearch.value = '';
  applyFilter();
  projectSearch.focus();
});

applyFilter('all');
