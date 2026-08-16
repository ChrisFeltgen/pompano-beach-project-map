// Printable Project Book — powers print.html.
//
// Deliberately independent of script.js: it doesn't need the map, Leaflet,
// or any of the sidebar/info-panel DOM, so it re-declares the small set of
// data helpers (status normalization, district parsing, the same
// api/projects.php -> api/projects -> projects.json fetch fallback) instead
// of pulling script.js in and fighting its map-init side effects.
(function () {
  'use strict';

  const DEFAULT_PROJECT_PHOTO = 'images/project-placeholder.png';
  const PROJECT_API_CANDIDATES = ['api/projects.php', 'api/projects'];

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

  const HIDDEN_BY_DEFAULT_STATUSES = ['expired', 'withdrawn'];

  // The book's 4-stage progress bar. Every tracked status collapses onto one
  // of these 4 stages (Withdrawn/Expired get a terminal badge instead — see
  // buildStepper()) — but the site's finer-grained statuses (Site Plan
  // Review vs. Approved; Building Permit Review vs. Issued) still show up
  // within a stage's own box, as which of its two labels/colors it takes
  // rather than as an extra box: "review"/"permit" render that stage as
  // active/in-progress, "planapproved"/"permitissued" render the SAME stage
  // as already complete (green, done), even though the book itself hasn't
  // advanced to the next stage yet.
  const BOOK_STAGE_LABELS = [
    { active: 'Site Plan Review', complete: 'Site Plan Approved' },
    { active: 'Building Permit Review', complete: 'Building Permit Issued' },
    { active: 'Under Construction', complete: 'Under Construction' },
    { active: 'Complete', complete: 'Complete' },
  ];
  const STATUS_STAGE_INFO = {
    proposed: { stage: 0, subState: 'active' },
    review: { stage: 0, subState: 'active' },
    planapproved: { stage: 0, subState: 'complete' },
    permit: { stage: 1, subState: 'active' },
    permitissued: { stage: 1, subState: 'complete' },
    construction: { stage: 2, subState: 'active' },
    completed: { stage: 3, subState: 'complete' },
    unknown: { stage: 0, subState: 'active' },
  };

  const DISTRICT_KEYS = ['1', '2', '3', '4', '5', ''];
  const DISTRICT_LABEL = {
    1: 'Commissioner District 1',
    2: 'Commissioner District 2',
    3: 'Commissioner District 3',
    4: 'Commissioner District 4',
    5: 'Commissioner District 5',
    '': 'Other Projects',
    __all: 'All Selected Projects', // used only when "separate by district" is off
  };

  // ---------- data helpers (mirrors script.js) ----------

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  function displayValue(value, fallback = 'TBD') {
    return hasValue(value) ? String(value).trim() : fallback;
  }

  function normalizeProjectStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (!value) return 'unknown';
    if (value === 'proposed') return 'proposed';
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

  function parseValuation(value) {
    if (!hasValue(value)) return null;
    const numeric = Number(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function formatCurrency(amount) {
    return '$' + Math.round(amount).toLocaleString('en-US');
  }

  function formatDate(value) {
    if (!hasValue(value)) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  // ---------- state ----------

  let allProjects = [];
  const selected = new Set(); // project.__id values
  const visibleStatuses = new Set(Object.keys(STATUS_LABELS).filter((key) => !HIDDEN_BY_DEFAULT_STATUSES.includes(key)));

  // ---------- DOM refs ----------

  const districtGroupsEl = document.getElementById('districtGroups');
  const selectionCountEl = document.getElementById('selectionCount');
  const pickerSearchEl = document.getElementById('pickerSearch');
  const statusFiltersEl = document.getElementById('statusFilters');
  const selectAllVisibleBtn = document.getElementById('selectAllVisible');
  const selectNoneBtn = document.getElementById('selectNone');
  const generateBtn = document.getElementById('generateBookBtn');
  const printBtn = document.getElementById('printBookBtn');
  const bookTitleEl = document.getElementById('bookTitle');
  const bookSubtitleEl = document.getElementById('bookSubtitle');
  const includeCoverEl = document.getElementById('includeCover');
  const includeTocEl = document.getElementById('includeToc');
  const includeSummaryEl = document.getElementById('includeSummary');
  const groupByDistrictEl = document.getElementById('groupByDistrict');
  const bookPreviewEl = document.getElementById('bookPreview');

  // ---------- picker rendering ----------

  function rowMatchesSearch(project, query) {
    if (!query) return true;
    return [project.title, project.address, project.developer, project.contractor]
      .some((value) => String(value || '').toLowerCase().includes(query));
  }

  function groupByDistrict(projects) {
    const groups = new Map(DISTRICT_KEYS.map((key) => [key, []]));
    projects.forEach((project) => {
      const key = DISTRICT_KEYS.includes(project.districtNumber) ? project.districtNumber : '';
      groups.get(key).push(project);
    });
    return groups;
  }

  function updateGroupCount(groupEl) {
    const boxes = groupEl.querySelectorAll('input[type="checkbox"][data-id]');
    const checked = groupEl.querySelectorAll('input[type="checkbox"][data-id]:checked');
    const countEl = groupEl.querySelector('.picker-group__count');
    if (countEl) countEl.textContent = `(${checked.length}/${boxes.length} shown selected)`;
  }

  function updateSelectionCount() {
    selectionCountEl.textContent = `${selected.size} of ${allProjects.length} projects selected for the book.`;
    generateBtn.disabled = selected.size === 0;
  }

  function renderStatusFilters() {
    statusFiltersEl.innerHTML = '';
    Object.keys(STATUS_LABELS).forEach((key) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'status-chip';
      button.style.setProperty('--chip-color', STATUS_COLORS[key]);
      button.textContent = STATUS_LABELS[key];
      const isActive = visibleStatuses.has(key);
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.addEventListener('click', () => {
        if (visibleStatuses.has(key)) visibleStatuses.delete(key);
        else visibleStatuses.add(key);
        renderStatusFilters();
        renderPicker();
      });
      statusFiltersEl.appendChild(button);
    });
  }

  function renderPicker() {
    const query = pickerSearchEl.value.trim().toLowerCase();
    const groups = groupByDistrict(allProjects);
    districtGroupsEl.innerHTML = '';

    let anyVisible = false;

    groups.forEach((projectsInGroup, districtKey) => {
      if (!projectsInGroup.length) return;
      const visibleRows = projectsInGroup.filter((project) => visibleStatuses.has(project.status) && rowMatchesSearch(project, query));

      const groupEl = el('section', 'picker-group');

      const header = el('div', 'picker-group__header');
      header.innerHTML = `
        <h3>${escapeHtml(DISTRICT_LABEL[districtKey])} <span class="picker-group__count"></span></h3>
        <div class="picker-group__bulk">
          <button type="button" data-action="select">Select shown</button>
          <button type="button" data-action="clear">Clear shown</button>
        </div>
      `;
      groupEl.appendChild(header);

      if (!visibleRows.length) {
        const empty = el('p', 'picker-group__empty');
        empty.textContent = 'No projects in this section match the current search/status filters.';
        groupEl.appendChild(empty);
      } else {
        anyVisible = true;
        const list = el('ul', 'picker-list');
        visibleRows.forEach((project) => {
          const item = document.createElement('li');
          const inputId = `pick-${project.__id}`;
          item.innerHTML = `
            <label class="picker-row" for="${inputId}" style="--status-color:${STATUS_COLORS[project.status] || STATUS_COLORS.unknown}">
              <input type="checkbox" id="${inputId}" data-id="${project.__id}" ${selected.has(project.__id) ? 'checked' : ''} />
              <span class="picker-row__status" aria-hidden="true"></span>
              <span class="picker-row__body">
                <span class="picker-row__title">${escapeHtml(project.title)}</span>
                <span class="picker-row__meta">${escapeHtml(displayValue(project.address, ''))}${project.address ? ' · ' : ''}${escapeHtml(project.statusLabel)}</span>
              </span>
            </label>
          `;
          list.appendChild(item);
        });
        groupEl.appendChild(list);
      }

      header.querySelector('[data-action="select"]').addEventListener('click', () => {
        visibleRows.forEach((project) => selected.add(project.__id));
        groupEl.querySelectorAll('input[type="checkbox"][data-id]').forEach((box) => { box.checked = true; });
        updateGroupCount(groupEl);
        updateSelectionCount();
      });
      header.querySelector('[data-action="clear"]').addEventListener('click', () => {
        visibleRows.forEach((project) => selected.delete(project.__id));
        groupEl.querySelectorAll('input[type="checkbox"][data-id]').forEach((box) => { box.checked = false; });
        updateGroupCount(groupEl);
        updateSelectionCount();
      });

      groupEl.querySelectorAll('input[type="checkbox"][data-id]').forEach((box) => {
        box.addEventListener('change', () => {
          const id = Number(box.dataset.id);
          if (box.checked) selected.add(id);
          else selected.delete(id);
          updateGroupCount(groupEl);
          updateSelectionCount();
        });
      });

      updateGroupCount(groupEl);
      districtGroupsEl.appendChild(groupEl);
    });

    if (!anyVisible) {
      districtGroupsEl.innerHTML = '<p class="picker-empty">No projects match the current search/status filters.</p>';
    }

    updateSelectionCount();
  }

  selectAllVisibleBtn.addEventListener('click', () => {
    districtGroupsEl.querySelectorAll('input[type="checkbox"][data-id]').forEach((box) => {
      selected.add(Number(box.dataset.id));
      box.checked = true;
    });
    districtGroupsEl.querySelectorAll('.picker-group').forEach(updateGroupCount);
    updateSelectionCount();
  });

  selectNoneBtn.addEventListener('click', () => {
    districtGroupsEl.querySelectorAll('input[type="checkbox"][data-id]').forEach((box) => {
      selected.delete(Number(box.dataset.id));
      box.checked = false;
    });
    districtGroupsEl.querySelectorAll('.picker-group').forEach(updateGroupCount);
    updateSelectionCount();
  });

  pickerSearchEl.addEventListener('input', renderPicker);

  // ---------- book plan (page numbering) ----------

  function getSelectedProjects() {
    const byId = new Map(allProjects.map((project) => [project.__id, project]));
    return [...selected]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  }

  // A table of contents for a 60+ project book doesn't fit on one page, and
  // relying on the browser to fragment one tall .book-page across multiple
  // printed sheets isn't reliable (Chrome treats an element that's a
  // positioning context for absolutely-positioned descendants as a single
  // unbreakable unit for pagination, which is exactly what our old
  // position:absolute footer/frame made every .book-page). So instead the
  // TOC is pre-chunked in JS into as many separate, ordinary .book-page
  // elements as it needs — each one short enough to never need to
  // fragment in the first place, each with its own accurate page number.
  const TOC_ROW_BUDGET_PX = 800; // conservative content-height budget per TOC page
  const TOC_DISTRICT_ROW_HEIGHT_PX = 36; // matches .toc-district's CSS (font + margin-top)
  const TOC_PROJECT_ROW_HEIGHT_PX = 24; // matches .toc-row's CSS (font + margin-top)

  function buildTocEntries(nonEmptyGroups, includeSummary, groupByDistrictOn) {
    const entries = [];
    nonEmptyGroups.forEach(([key, list]) => {
      // When projects aren't separated by district, there's nothing to
      // head each group with — nonEmptyGroups is just one "__all" bucket,
      // and the TOC should read as one flat alphabetical list.
      if (groupByDistrictOn) entries.push({ type: 'district', key, label: DISTRICT_LABEL[key] });
      list.forEach((project) => entries.push({ type: 'project', project }));
    });
    if (includeSummary) {
      entries.push({ type: 'district', key: '__summary', label: 'Summary & Valuations' });
    }
    return entries;
  }

  function chunkTocEntries(entries) {
    const chunks = [];
    let current = [];
    let used = 0;
    entries.forEach((entry) => {
      const height = entry.type === 'district' ? TOC_DISTRICT_ROW_HEIGHT_PX : TOC_PROJECT_ROW_HEIGHT_PX;
      if (used + height > TOC_ROW_BUDGET_PX && current.length) {
        chunks.push(current);
        current = [];
        used = 0;
      }
      current.push(entry);
      used += height;
    });
    if (current.length) chunks.push(current);
    return chunks.length ? chunks : [[]];
  }

  // Same reasoning as the TOC above: a district with a lot of projects
  // (District 1 can run 25+) puts its summary table right at, or just
  // past, one page's worth of rows. Letting the browser fragment a nearly-
  // full table organically is exactly what produced the near-blank "extra"
  // page — min-height on the fragmenting flex box gets reapplied to
  // whatever sliver of the table spills over, reserving a whole additional
  // page for it. Pre-chunking each district's rows sidesteps that the same
  // way the TOC fix did: every summary page is built short enough that it
  // never needs to fragment at all.
  const SUMMARY_ROW_BUDGET_PX = 780; // conservative content-height budget per summary page
  const SUMMARY_TABLE_ROW_HEIGHT_PX = 34; // matches .book-summary-table td's CSS (font + padding + border)
  const SUMMARY_HEADER_RESERVE_PX = 90; // title + thead
  const SUMMARY_SUBTOTAL_RESERVE_PX = 40; // tfoot row, only actually used on a chunk's last page

  function chunkSummaryProjects(projects) {
    const budget = SUMMARY_ROW_BUDGET_PX - SUMMARY_HEADER_RESERVE_PX - SUMMARY_SUBTOTAL_RESERVE_PX;
    const chunks = [];
    let current = [];
    let used = 0;
    projects.forEach((project) => {
      if (used + SUMMARY_TABLE_ROW_HEIGHT_PX > budget && current.length) {
        chunks.push(current);
        current = [];
        used = 0;
      }
      current.push(project);
      used += SUMMARY_TABLE_ROW_HEIGHT_PX;
    });
    if (current.length) chunks.push(current);
    return chunks.length ? chunks : [[]];
  }

  function computeBookPlan(selectedProjects, opts) {
    // Grouped: the usual per-district split. Ungrouped: one bucket holding
    // everyone, already alphabetical (getSelectedProjects() sorts by
    // title) — every downstream step (TOC, divider/opener placement,
    // summary chunking) already operates on "a list of (key, projects)
    // groups", so a single "__all" group reuses all of that without
    // needing its own separate code path.
    const nonEmptyGroups = opts.groupByDistrict
      ? [...groupByDistrict(selectedProjects).entries()].filter(([, list]) => list.length)
      : [['__all', selectedProjects]];

    const tocChunks = opts.includeToc
      ? chunkTocEntries(buildTocEntries(nonEmptyGroups, opts.includeSummary, opts.groupByDistrict))
      : [];

    let page = 0;
    const plan = { cover: null, toc: null, districts: [], summary: null };

    // Duplex/booklet convention: a section opener (the cover, each district
    // divider) always lands on an odd, right-hand page, with its back
    // (the next, even page) left intentionally blank — so printing double-
    // sided never puts real content on the back of an opener. If whatever
    // came before ends on an odd page already, one blank is inserted first
    // to push the opener to the next odd page; the mandatory blank behind
    // it is unconditional.
    function placeSectionOpener() {
      let blankBefore = null;
      if ((page + 1) % 2 === 0) {
        page += 1;
        blankBefore = page;
      }
      page += 1;
      const openerPage = page;
      page += 1;
      const blankAfter = page;
      return { blankBefore, openerPage, blankAfter };
    }

    if (opts.includeCover) {
      const { openerPage, blankAfter } = placeSectionOpener();
      plan.cover = { page: openerPage, blankAfter };
    }
    if (opts.includeToc) {
      const tocPages = tocChunks.map(() => {
        page += 1;
        return page;
      });
      plan.toc = { chunks: tocChunks, pages: tocPages };
    }

    nonEmptyGroups.forEach(([key, list]) => {
      // Ungrouped: no chapter to open — every project just follows the
      // last one in one continuous alphabetical run, no divider page and
      // no forced blanks around it.
      let blankBefore = null;
      let openerPage = null;
      let blankAfter = null;
      if (opts.groupByDistrict) {
        ({ blankBefore, openerPage, blankAfter } = placeSectionOpener());
      }
      const projectPages = list.map((project) => {
        page += 1;
        return { project, page };
      });
      plan.districts.push({ key, label: DISTRICT_LABEL[key], blankBefore, dividerPage: openerPage, blankAfter, projects: projectPages });
    });

    if (opts.includeSummary) {
      const summaryPages = [];
      nonEmptyGroups.forEach(([key, list]) => {
        const chunks = chunkSummaryProjects(list);
        chunks.forEach((chunkProjects, chunkIndex) => {
          page += 1;
          summaryPages.push({
            key,
            label: DISTRICT_LABEL[key],
            page,
            projects: chunkProjects,
            isContinuation: chunkIndex > 0,
            isLastChunk: chunkIndex === chunks.length - 1,
          });
        });
      });
      // The grand-total breakdown-by-section page is only useful when
      // there's more than one section to break down — with grouping off
      // there's just the one summary table, and its own subtotal already
      // is the grand total, so a whole extra page repeating that same
      // number isn't worth it.
      let grandTotalPage = null;
      if (opts.groupByDistrict) {
        page += 1;
        grandTotalPage = page;
      }
      plan.summary = { pages: summaryPages, grandTotalPage };
    }

    plan.totalPages = page;
    return plan;
  }

  // ---------- page builders ----------

  function buildFooter(leftText, pageNum, totalPages) {
    // "City of Pompano Beach" is the constant, running left-side mark on
    // every page's footer; whatever page-specific text a builder passes in
    // (a last-updated date, the cover's URL, ...) follows it rather than
    // replacing it.
    const left = leftText ? `City of Pompano Beach &middot; ${escapeHtml(leftText)}` : 'City of Pompano Beach';
    return `<div class="book-page__footer"><span>${left}</span><span>Page ${pageNum} of ${totalPages}</span></div>`;
  }

  // A genuinely blank page, inserted for double-sided printing so the next
  // section opener starts on a fresh right-hand sheet. No footer/page
  // number and no border/frame — same "This page is intentionally left
  // blank" convention real printed reports use, so it reads as deliberate
  // rather than a rendering glitch.
  function buildBlankPage() {
    const pageEl = el('section', 'book-page book-page--blank');
    pageEl.setAttribute('aria-hidden', 'true');
    pageEl.innerHTML = '<div class="book-blank-note">This page is intentionally left blank.</div>';
    return pageEl;
  }

  function buildStepper(project) {
    if (project.status === 'withdrawn' || project.status === 'expired') {
      return `<div class="book-status-pill book-status-pill--${project.status}">${escapeHtml(project.statusLabel)}</div>`;
    }
    const info = STATUS_STAGE_INFO[project.status] || STATUS_STAGE_INFO.unknown;
    const steps = BOOK_STAGE_LABELS.map((labelPair, index) => {
      let cls = 'book-stepper__step';
      let label = labelPair.active;
      if (index < info.stage) {
        // A stage the book has already moved past is always shown fully
        // done, using its "complete" wording (e.g. Site Plan Approved)
        // regardless of which specific status flipped it to done.
        cls += ' is-complete';
        label = labelPair.complete;
      } else if (index === info.stage) {
        if (info.subState === 'complete') {
          cls += ' is-complete';
          label = labelPair.complete;
        } else {
          cls += ' is-current';
          label = labelPair.active;
        }
      }
      return `<div class="${cls}">${escapeHtml(label)}</div>`;
    }).join('');
    return `<div class="book-stepper">${steps}</div>`;
  }

  function buildCoverPage(title, subtitle, count, pageNum, totalPages) {
    const pageEl = el('section', 'book-page book-page--cover');
    const generated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    pageEl.innerHTML = `
      <div class="book-cover">
        <img class="book-cover__logo" src="https://www.pompanobeachfl.gov/pompanobeachfl/assets/images/sitewide/COPB_Logo.png" alt="City of Pompano Beach logo" />
        <h1>${escapeHtml(title)}</h1>
        <div class="book-cover__dept">Building Department</div>
        ${subtitle ? `<div class="book-cover__subtitle">${escapeHtml(subtitle)}</div>` : ''}
        <div class="book-cover__meta">Generated ${escapeHtml(generated)} &middot; ${count} project${count === 1 ? '' : 's'}</div>
      </div>
      ${buildFooter('pompanobeachfl.gov', pageNum, totalPages)}
    `;
    return pageEl;
  }

  function buildTocPages(plan) {
    const districtPageByKey = new Map(plan.districts.map((district) => [district.key, district.dividerPage]));
    const projectPageById = new Map();
    plan.districts.forEach((district) => {
      district.projects.forEach(({ project, page }) => projectPageById.set(project.__id, page));
    });
    const summaryPage = plan.summary
      ? (plan.summary.pages[0] ? plan.summary.pages[0].page : plan.summary.grandTotalPage)
      : null;

    return plan.toc.chunks.map((chunk, chunkIndex) => {
      const rows = chunk.map((entry) => {
        if (entry.type === 'district') {
          const targetPage = entry.key === '__summary' ? summaryPage : districtPageByKey.get(entry.key);
          return `<div class="toc-district"><span>${escapeHtml(entry.label)}</span><span class="toc-dots" aria-hidden="true"></span><span class="toc-page">${targetPage}</span></div>`;
        }
        const targetPage = projectPageById.get(entry.project.__id);
        return `<div class="toc-row"><span>${escapeHtml(entry.project.title)}</span><span class="toc-dots" aria-hidden="true"></span><span class="toc-page">${targetPage}</span></div>`;
      }).join('');

      const pageEl = el('section', 'book-page book-page--toc');
      const heading = chunkIndex === 0 ? 'Table of Contents' : 'Table of Contents (continued)';
      pageEl.innerHTML = `
        <h1 class="book-page__title">${heading}</h1>
        <div class="toc-list">${rows}</div>
        ${buildFooter('', plan.toc.pages[chunkIndex], plan.totalPages)}
      `;
      return pageEl;
    });
  }

  function buildDistrictDivider(label, count, pageNum, totalPages) {
    const pageEl = el('section', 'book-page book-page--divider');
    pageEl.innerHTML = `
      <div class="book-divider">
        <div class="book-divider__eyebrow">City of Pompano Beach &middot; Building Department</div>
        <h1>${escapeHtml(label)}</h1>
        <p>${count} project${count === 1 ? '' : 's'} featured in this section</p>
      </div>
      ${buildFooter('', pageNum, totalPages)}
    `;
    return pageEl;
  }

  function buildProjectPage(project, pageNum, totalPages) {
    const pageEl = el('article', 'book-page book-page--project');
    const photoUrl = escapeHtml(resolveAssetUrl(project.photo));
    const fallbackUrl = escapeHtml(resolveAssetUrl(''));
    const footerLeft = project.lastUpdated ? `Last updated ${formatDate(project.lastUpdated)}` : '';
    // Always the project's own district, not whichever group it happened
    // to render under — accurate whether or not the book is separated by
    // district, and unaffected by that toggle either way.
    const districtLabel = DISTRICT_LABEL[project.districtNumber] || DISTRICT_LABEL[''];
    pageEl.innerHTML = `
      <div class="book-page__kicker">${escapeHtml(districtLabel)}</div>
      <h1 class="book-page__title">${escapeHtml(project.title)}</h1>
      ${buildStepper(project)}
      <div class="book-field book-field--wide">
        <div class="book-field__label">Address</div>
        <div class="book-field__value">${escapeHtml(displayValue(project.address))}</div>
      </div>
      <div class="book-field book-field--wide">
        <div class="book-field__label">Description</div>
        <div class="book-field__value">${escapeHtml(displayValue(project.description))}</div>
      </div>
      <div class="book-photo">
        <img src="${photoUrl}" alt="" loading="eager" onerror="this.onerror=null;this.src='${fallbackUrl}';" />
      </div>
      <div class="book-fields-grid">
        <div class="book-field"><div class="book-field__label">Est. Completion</div><div class="book-field__value">${escapeHtml(displayValue(project.completion))}</div></div>
        <div class="book-field"><div class="book-field__label">Valuation</div><div class="book-field__value">${escapeHtml(displayValue(project.valuation))}</div></div>
        <div class="book-field"><div class="book-field__label">Developer</div><div class="book-field__value">${escapeHtml(displayValue(project.developer))}</div></div>
        <div class="book-field"><div class="book-field__label">Prime Contractor</div><div class="book-field__value">${escapeHtml(displayValue(project.contractor))}</div></div>
        <div class="book-field"><div class="book-field__label">PZ Project #</div><div class="book-field__value">${escapeHtml(displayValue(project.pzProject))}</div></div>
        <div class="book-field"><div class="book-field__label">Building Permit #</div><div class="book-field__value">${escapeHtml(displayValue(project.buildingPermit))}</div></div>
      </div>
      ${buildFooter(footerLeft, pageNum, totalPages)}
    `;
    return pageEl;
  }

  function buildSummaryPage(section, pageNum, totalPages, allDistrictProjects) {
    const pageEl = el('section', 'book-page book-page--summary');
    const rows = section.projects.map((project) => {
      const amount = parseValuation(project.valuation);
      return `<tr><td>${escapeHtml(project.title)}</td><td>${escapeHtml(displayValue(project.address))}</td><td class="num">${amount ? formatCurrency(amount) : escapeHtml(displayValue(project.valuation))}</td></tr>`;
    }).join('');
    // The subtotal reflects every project in the district, not just this
    // chunk's rows — and only renders on the chunk that actually reaches
    // the end of the table, the way a paginated financial report would.
    let tfoot = '';
    if (section.isLastChunk) {
      const subtotal = allDistrictProjects.reduce((sum, project) => sum + (parseValuation(project.valuation) || 0), 0);
      tfoot = `<tfoot><tr><td colspan="2">Section Subtotal</td><td class="num">${formatCurrency(subtotal)}</td></tr></tfoot>`;
    }
    const heading = `${escapeHtml(section.label)} &mdash; Summary${section.isContinuation ? ' (continued)' : ''}`;
    pageEl.innerHTML = `
      <h1 class="book-page__title">${heading}</h1>
      <table class="book-summary-table">
        <thead><tr><th>Project Name</th><th>Address</th><th class="num">Valuation</th></tr></thead>
        <tbody>${rows}</tbody>
        ${tfoot}
      </table>
      ${buildFooter('', pageNum, totalPages)}
    `;
    return pageEl;
  }

  function buildGrandTotalPage(districtTotals, pageNum, totalPages) {
    const rows = districtTotals.map((district) => {
      return `<tr><td>${escapeHtml(district.label)}</td><td class="num">${district.count}</td><td class="num">${formatCurrency(district.subtotal)}</td></tr>`;
    }).join('');
    const grandTotal = districtTotals.reduce((sum, district) => sum + district.subtotal, 0);
    const totalProjects = districtTotals.reduce((sum, district) => sum + district.count, 0);
    const pageEl = el('section', 'book-page book-page--summary');
    pageEl.innerHTML = `
      <h1 class="book-page__title">Grand Total</h1>
      <table class="book-summary-table">
        <thead><tr><th>Section</th><th class="num">Projects</th><th class="num">Valuation</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${totalProjects}</td><td class="num">${formatCurrency(grandTotal)}</td></tr></tfoot>
      </table>
      <p class="book-summary-note">Projects with no reported figure ("TBD") are excluded from these totals, so the amounts above are a floor, not a complete total.</p>
      ${buildFooter('', pageNum, totalPages)}
    `;
    return pageEl;
  }

  // ---------- render ----------

  function renderBook(plan, opts) {
    bookPreviewEl.innerHTML = '';

    if (plan.cover) {
      bookPreviewEl.appendChild(buildCoverPage(opts.title, opts.subtitle, opts.totalSelected, plan.cover.page, plan.totalPages));
      if (plan.cover.blankAfter) bookPreviewEl.appendChild(buildBlankPage());
    }
    if (plan.toc) buildTocPages(plan).forEach((pageEl) => bookPreviewEl.appendChild(pageEl));

    plan.districts.forEach((district) => {
      if (district.blankBefore) bookPreviewEl.appendChild(buildBlankPage());
      if (district.dividerPage) {
        bookPreviewEl.appendChild(buildDistrictDivider(district.label, district.projects.length, district.dividerPage, plan.totalPages));
      }
      if (district.blankAfter) bookPreviewEl.appendChild(buildBlankPage());
      district.projects.forEach(({ project, page }) => {
        bookPreviewEl.appendChild(buildProjectPage(project, page, plan.totalPages));
      });
    });

    if (plan.summary) {
      // plan.districts already holds each district's FULL (un-chunked)
      // project list — reused here so a district's subtotal/grand-total
      // math reflects all of its projects, not just whichever chunk a
      // summary page happens to hold.
      const districtProjectsByKey = new Map(plan.districts.map((district) => [district.key, district.projects.map(({ project }) => project)]));

      plan.summary.pages.forEach((section) => {
        const allDistrictProjects = districtProjectsByKey.get(section.key) || section.projects;
        bookPreviewEl.appendChild(buildSummaryPage(section, section.page, plan.totalPages, allDistrictProjects));
      });

      if (plan.summary.grandTotalPage) {
        const districtTotals = plan.districts.map((district) => {
          const projects = district.projects.map(({ project }) => project);
          const subtotal = projects.reduce((sum, project) => sum + (parseValuation(project.valuation) || 0), 0);
          return { label: district.label, count: projects.length, subtotal };
        });
        bookPreviewEl.appendChild(buildGrandTotalPage(districtTotals, plan.summary.grandTotalPage, plan.totalPages));
      }
    }

    bookPreviewEl.hidden = false;
    printBtn.hidden = false;
    bookPreviewEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  generateBtn.addEventListener('click', () => {
    const selectedProjects = getSelectedProjects();
    if (!selectedProjects.length) return;

    const opts = {
      title: bookTitleEl.value.trim() || 'New Projects within the City of Pompano Beach',
      subtitle: bookSubtitleEl.value.trim(),
      includeCover: includeCoverEl.checked,
      includeToc: includeTocEl.checked,
      includeSummary: includeSummaryEl.checked,
      groupByDistrict: groupByDistrictEl.checked,
      totalSelected: selectedProjects.length,
    };

    const plan = computeBookPlan(selectedProjects, opts);
    renderBook(plan, opts);
  });

  printBtn.addEventListener('click', () => window.print());

  // ---------- load ----------

  fetchProjectsData()
    .then((data) => {
      allProjects = data
        .map((project, index) => ({
          ...project,
          __id: index,
          status: normalizeProjectStatus(project.status || project.type),
          statusLabel: getProjectStatusLabel(project.status || project.type, normalizeProjectStatus(project.status || project.type)),
          districtNumber: normalizeProjectDistrict(project.district),
        }))
        .sort((a, b) => displayValue(a.title, '').localeCompare(displayValue(b.title, ''), undefined, { numeric: true, sensitivity: 'base' }));

      // Default selection: the projects that would actually appear in a
      // book like the source document — assigned to one of the five
      // commissioner districts, and not Expired/Withdrawn. Everything else
      // (unassigned "Other Projects") is still pickable, just opt-in.
      allProjects.forEach((project) => {
        if (project.districtNumber && !HIDDEN_BY_DEFAULT_STATUSES.includes(project.status)) {
          selected.add(project.__id);
        }
      });

      renderStatusFilters();
      renderPicker();
    })
    .catch((error) => {
      console.error(error);
      districtGroupsEl.innerHTML = '<p class="picker-empty">Unable to load project data. Try reloading the page.</p>';
    });
})();
