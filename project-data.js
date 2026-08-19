// Shared project-data helpers — status labels/colors, field-normalization
// functions, and the projects.json fetch fallback — used by both the
// public map (script.js) and the printable project book (book.js). Kept
// in one place so a status label/color, or a data-parsing rule, can't
// silently drift out of sync between the two the way it would if each
// file kept its own copy.
//
// A plain (non-module) script, loaded before script.js/book.js in
// index.html/print.html — its top-level const/function declarations are
// ordinary globals, visible to whatever loads after it, including from
// inside book.js's IIFE.

const DEFAULT_PROJECT_PHOTO = 'images/project-placeholder.png';
const PROJECT_API_CANDIDATES = ['api/projects.php', 'api/projects'];

const statusColors = {
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

const statusLabels = {
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

// Expired/withdrawn projects are hidden by default in both the map's
// filters and the print book's default selection.
const HIDDEN_BY_DEFAULT_STATUSES = ['expired', 'withdrawn'];

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

// A project is "featured" unless the admin has explicitly turned it off —
// so every project saved before this field existed (no `featured` key at
// all) keeps showing up exactly as it always did. Featured projects appear
// on the public map and in the print book by default; non-featured ones are
// left out of both unless the viewer opts in via the map's filter menu or
// the book's project picker.
function isProjectFeatured(project) {
  const value = project?.featured;
  if (!hasValue(value)) return true;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'no';
}

function displayValue(value, fallback = 'TBD') {
  return hasValue(value) ? String(value).trim() : fallback;
}

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
  return statusLabels[normalizedStatus] || statusLabels.unknown;
}

function normalizeProjectDistrict(district) {
  const match = String(district || '').match(/[1-5]/);
  return match ? match[0] : '';
}

function resolveAssetUrl(assetPath) {
  const path = hasValue(assetPath) ? String(assetPath).trim() : DEFAULT_PROJECT_PHOTO;
  try {
    return new URL(path, window.location.href).toString();
  } catch {
    return path;
  }
}

async function fetchProjectsData() {
  for (const path of PROJECT_API_CANDIDATES) {
    try {
      const apiResponse = await fetch(new URL(path, window.location.href), { cache: 'no-store' });
      if (!apiResponse.ok) throw new Error(`API returned ${apiResponse.status}`);
      return await apiResponse.json();
    } catch {
      continue;
    }
  }

  const staticResponse = await fetch('projects.json', { cache: 'no-store' });
  if (!staticResponse.ok) throw new Error(`Failed to load projects.json: ${staticResponse.status}`);
  return staticResponse.json();
}
