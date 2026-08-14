const fs = require('fs');
const path = require('path');

// Shared by admin-server.js's upload handler (cleaning up a photo a new
// upload replaces) and its delete-photo route (the explicit Remove Photo
// action) — deliberately conservative: only ever deletes a file that is
// unambiguously one of this tool's own uploads inside images/, never an
// external URL, never the shared placeholder, and never anything a crafted
// path could walk outside that directory to reach.
async function deleteAdminPhoto(photoPath, imagesDir) {
  const trimmed = String(photoPath || '').trim();
  if (!trimmed) return false;

  const match = /^images\/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|gif|webp))$/i.exec(trimmed);
  if (!match) return false;

  const filename = match[1];
  if (filename.toLowerCase() === 'project-placeholder.png') return false;

  const resolvedImagesDir = path.resolve(imagesDir);
  const target = path.resolve(imagesDir, filename);

  if (!target.startsWith(resolvedImagesDir + path.sep)) return false;

  try {
    await fs.promises.unlink(target);
    return true;
  } catch {
    return false;
  }
}

module.exports = { deleteAdminPhoto };
