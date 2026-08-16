<?php
require __DIR__ . '/api/auth.php';
$currentAdminUser = require_admin_auth();
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Project Data Maintenance</title>
  <link rel="shortcut icon" type="image/x-icon" href="https://www.pompanobeachfl.gov/pompanobeachfl/assets/images/favicon.ico?v=2" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="admin.css" />
</head>
<body>
  <header class="city-site-header">
    <a class="show-on-focus" href="#adminContent">Skip to Content</a>

    <div class="city-site-header__main">
      <a class="city-brand" href="index.html" aria-label="Development projects map home">
        <img
          src="https://www.pompanobeachfl.gov/pompanobeachfl/assets/images/sitewide/COPB_Logo.png"
          alt="City of Pompano Beach Logo"
          class="city-brand__logo"
        />
        <span class="city-brand__divider" aria-hidden="true"></span>
        <span class="city-brand__welcome">
          <span>Welcome to</span>
          <strong>Pompano Beach</strong>
        </span>
      </a>

      <nav class="city-nav" aria-label="Maintenance navigation">
        <a href="index.html">Map</a>
        <a href="#" id="manageUsersButton" hidden>Manage Users</a>
        <a href="#" id="logoutButton">Log Out</a>
      </nav>
    </div>

    <div class="city-dept-bar" aria-label="Maintenance breadcrumb">
      <div class="city-dept-bar__inner">
        <a href="index.html">Development Projects Map</a>
        <span class="city-dept-bar__separator" aria-hidden="true">/</span>
        <span>Project Data Maintenance</span>
      </div>
    </div>
  </header>

  <main class="admin-shell" id="adminContent">
    <section class="admin-layout">
      <aside class="admin-list-panel" aria-label="Projects">
        <section class="admin-toolbar" aria-label="Project maintenance actions">
          <h1>Project Data Maintenance</h1>
          <p id="adminStatus">Loading projects...</p>

          <div class="admin-actions">
            <button id="reloadProjects" type="button">Reload</button>
            <button id="exportProjects" type="button">Export JSON</button>
            <a id="printBookLink" href="print.html" target="_blank" rel="noopener">Print / Export Book</a>
            <button id="saveProjects" type="button" class="primary-action">Save Changes</button>
          </div>

          <label class="sr-only" for="projectSearch">Search projects</label>
          <input id="projectSearch" type="search" placeholder="Search projects..." />
          <button id="addProject" type="button" class="primary-action">Add Project</button>
        </section>

        <div class="project-count" id="projectCount"></div>
        <ul class="admin-project-list project-list" id="adminProjectList"></ul>
      </aside>

      <section class="admin-editor" aria-label="Project editor">
        <form id="projectEditorForm" autocomplete="off">
          <h2 class="editor-title" id="editorTitle">
            Select a project to edit its JSON fields.
          </h2>
          <div class="admin-photo-frame" id="adminPhotoFrame" aria-busy="false">
            <img id="adminProjectPhoto" src="images/project-placeholder.png" alt="Project photo preview" />
            <div class="admin-photo-loader" aria-hidden="true"></div>
          </div>
          <div class="admin-photo-controls" id="photoControls" hidden></div>
          <div class="editor-fields" id="editorFields" hidden></div>
          <div class="editor-actions" id="editorActions" hidden>
            <button id="deleteProject" type="button" class="danger-action">Delete Project</button>
          </div>
        </form>
      </section>
    </section>
  </main>

  <div class="user-manager-modal" id="userManagerModal" hidden>
    <div class="user-manager-modal__backdrop" id="userManagerBackdrop"></div>
    <div class="user-manager-modal__content" role="dialog" aria-modal="true" aria-labelledby="userManagerTitle">
      <div class="user-manager-modal__header">
        <h2 id="userManagerTitle">Manage Users</h2>
        <button id="userManagerClose" type="button" aria-label="Close">&times;</button>
      </div>

      <p id="userManagerStatus" class="field-hint" aria-live="polite"></p>

      <ul class="user-manager-list" id="userManagerList"></ul>

      <form id="addUserForm" class="user-manager-add-form">
        <h3>Add Account</h3>
        <div class="field-group">
          <label for="newUserUsername">Username</label>
          <input
            id="newUserUsername"
            class="field-control"
            type="text"
            required
            minlength="2"
            maxlength="40"
            pattern="[A-Za-z0-9_.\-]+"
            autocomplete="off"
          />
        </div>
        <div class="field-group">
          <label for="newUserPassword">Password</label>
          <input
            id="newUserPassword"
            class="field-control"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
          />
        </div>
        <div class="field-group">
          <label for="newUserRole">Account Level</label>
          <select id="newUserRole" class="field-control">
            <option value="editor" selected>Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" class="primary-action">Add Account</button>
      </form>
    </div>
  </div>

  <script>
    // Server-rendered, so admin.js has the logged-in user's identity/role
    // immediately — no extra round trip (and no flash of hidden-then-shown
    // UI) the way a client-side whoami fetch would need.
    window.__ADMIN_USER__ = <?php echo json_encode($currentAdminUser); ?>;
  </script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="admin.js"></script>
</body>
</html>
