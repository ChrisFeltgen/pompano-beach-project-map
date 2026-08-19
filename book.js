// Printable Project Book — powers print.html.
//
// Deliberately independent of script.js: it doesn't need the map, Leaflet,
// or any of the sidebar/info-panel DOM, so it doesn't load that file at
// all. The status labels/colors, HIDDEN_BY_DEFAULT_STATUSES, and the data-
// normalization helpers (normalizeProjectStatus, displayValue,
// fetchProjectsData, ...) it does share with script.js live in
// project-data.js, loaded before this file in print.html — kept in one
// place so the map and the book can't drift out of sync on either.
(function () {
  'use strict';

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

  // hasValue, displayValue, normalizeProjectStatus, getProjectStatusLabel,
  // normalizeProjectDistrict, resolveAssetUrl, and fetchProjectsData all
  // come from project-data.js (loaded before this file in print.html).

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
  let projectsById = new Map();
  const selected = new Set(); // project.__id values

  // ---------- DOM refs ----------

  const districtGroupsEl = document.getElementById('districtGroups');
  const selectionCountEl = document.getElementById('selectionCount');
  const pickerSearchEl = document.getElementById('pickerSearch');
  const statusFiltersEl = document.getElementById('statusFilters');
  const featuredFiltersEl = document.getElementById('featuredFilters');
  const selectAllVisibleBtn = document.getElementById('selectAllVisible');
  const selectNoneBtn = document.getElementById('selectNone');
  const generateBtn = document.getElementById('generateBookBtn');
  const printBtn = document.getElementById('printBookBtn');
  // Also its initial label in print.html, kept in sync with that markup so
  // there's no flash-to-different-text if JS reads the button before this
  // runs.
  const PRINT_BTN_READY_LABEL = 'Print / Save as PDF';
  const PRINT_BTN_LOADING_LABEL = 'Preparing book…';
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

  // "full" = every project with this status is selected, "none" = none are,
  // "partial" = some are. Status chips are a bulk select/deselect action
  // driven by this, not a view filter — the picker list always shows every
  // project that matches the search box, regardless of status.
  function getStatusSelectionState(key) {
    const projectsOfStatus = allProjects.filter((project) => project.status === key);
    if (!projectsOfStatus.length) return 'none';
    const selectedCount = projectsOfStatus.filter((project) => selected.has(project.__id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === projectsOfStatus.length) return 'full';
    return 'partial';
  }

  function updateStatusChipVisuals() {
    statusFiltersEl.querySelectorAll('.status-chip[data-status]').forEach((chip) => {
      const state = getStatusSelectionState(chip.dataset.status);
      chip.classList.toggle('is-full', state === 'full');
      chip.classList.toggle('is-partial', state === 'partial');
      chip.setAttribute('aria-pressed', String(state === 'full'));
    });
  }

  // Same tri-state bulk select/deselect as the status chips above, but
  // grouped by the Featured flag instead of status — lets the book builder
  // pull in every non-featured project (or drop every featured one) in a
  // single click, without hunting through the district lists by hand.
  function getProjectsByFeatured(isFeaturedGroup) {
    return allProjects.filter((project) => isProjectFeatured(project) === isFeaturedGroup);
  }

  function getFeaturedSelectionState(isFeaturedGroup) {
    const projectsInGroup = getProjectsByFeatured(isFeaturedGroup);
    if (!projectsInGroup.length) return 'none';
    const selectedCount = projectsInGroup.filter((project) => selected.has(project.__id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === projectsInGroup.length) return 'full';
    return 'partial';
  }

  function updateFeaturedChipVisuals() {
    featuredFiltersEl.querySelectorAll('.status-chip[data-featured]').forEach((chip) => {
      const state = getFeaturedSelectionState(chip.dataset.featured === 'yes');
      chip.classList.toggle('is-full', state === 'full');
      chip.classList.toggle('is-partial', state === 'partial');
      chip.setAttribute('aria-pressed', String(state === 'full'));
    });
  }

  function renderFeaturedFilters() {
    featuredFiltersEl.innerHTML = '';
    [
      { key: 'yes', label: 'Featured', color: statusColors.completed, isFeaturedGroup: true },
      { key: 'no', label: 'Not Featured', color: statusColors.unknown, isFeaturedGroup: false },
    ].forEach(({ key, label, color, isFeaturedGroup }) => {
      const projectsInGroup = getProjectsByFeatured(isFeaturedGroup);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'status-chip';
      button.dataset.featured = key;
      button.style.setProperty('--chip-color', color);
      button.textContent = `${label} (${projectsInGroup.length})`;
      button.disabled = projectsInGroup.length === 0;
      button.title = `Select or deselect every "${label}" project`;
      button.addEventListener('click', () => {
        const shouldSelect = getFeaturedSelectionState(isFeaturedGroup) !== 'full';
        projectsInGroup.forEach((project) => {
          if (shouldSelect) selected.add(project.__id);
          else selected.delete(project.__id);
        });
        districtGroupsEl.querySelectorAll('input[type="checkbox"][data-id]').forEach((box) => {
          const project = projectsById.get(Number(box.dataset.id));
          if (project && isProjectFeatured(project) === isFeaturedGroup) box.checked = shouldSelect;
        });
        districtGroupsEl.querySelectorAll('.picker-group').forEach(updateGroupCount);
        updateSelectionCount();
      });
      featuredFiltersEl.appendChild(button);
    });
    updateFeaturedChipVisuals();
  }

  function updateSelectionCount() {
    selectionCountEl.textContent = `${selected.size} of ${allProjects.length} projects selected for the book.`;
    generateBtn.disabled = selected.size === 0;
    updateStatusChipVisuals();
    updateFeaturedChipVisuals();
  }

  function renderStatusFilters() {
    statusFiltersEl.innerHTML = '';
    Object.keys(statusLabels).forEach((key) => {
      const projectsOfStatus = allProjects.filter((project) => project.status === key);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'status-chip';
      button.dataset.status = key;
      button.style.setProperty('--chip-color', statusColors[key]);
      button.textContent = `${statusLabels[key]} (${projectsOfStatus.length})`;
      button.disabled = projectsOfStatus.length === 0;
      button.title = `Select or deselect every "${statusLabels[key]}" project`;
      button.addEventListener('click', () => {
        // Clicking moves toward "select all" unless every one of this
        // status is already selected, in which case it clears them —
        // the same click behavior as a native tri-state checkbox.
        const shouldSelect = getStatusSelectionState(key) !== 'full';
        projectsOfStatus.forEach((project) => {
          if (shouldSelect) selected.add(project.__id);
          else selected.delete(project.__id);
        });
        districtGroupsEl.querySelectorAll('input[type="checkbox"][data-id]').forEach((box) => {
          const project = projectsById.get(Number(box.dataset.id));
          if (project && project.status === key) box.checked = shouldSelect;
        });
        districtGroupsEl.querySelectorAll('.picker-group').forEach(updateGroupCount);
        updateSelectionCount();
      });
      statusFiltersEl.appendChild(button);
    });
    updateStatusChipVisuals();
  }

  function renderPicker() {
    const query = pickerSearchEl.value.trim().toLowerCase();
    const groups = groupByDistrict(allProjects);
    districtGroupsEl.innerHTML = '';

    let anyVisible = false;

    groups.forEach((projectsInGroup, districtKey) => {
      if (!projectsInGroup.length) return;
      const visibleRows = projectsInGroup.filter((project) => rowMatchesSearch(project, query));

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
        empty.textContent = 'No projects in this section match your search.';
        groupEl.appendChild(empty);
      } else {
        anyVisible = true;
        const list = el('ul', 'picker-list');
        visibleRows.forEach((project) => {
          const item = document.createElement('li');
          const inputId = `pick-${project.__id}`;
          item.innerHTML = `
            <label class="picker-row" for="${inputId}" style="--status-color:${statusColors[project.status] || statusColors.unknown}">
              <input type="checkbox" id="${inputId}" data-id="${project.__id}" ${selected.has(project.__id) ? 'checked' : ''} />
              <span class="picker-row__status" aria-hidden="true"></span>
              <span class="picker-row__body">
                <span class="picker-row__title">${escapeHtml(project.title)}</span>
                <span class="picker-row__meta">${escapeHtml(displayValue(project.address, ''))}${project.address ? ' · ' : ''}${escapeHtml(project.statusLabel)}${isProjectFeatured(project) ? '' : ' · Not Featured'}</span>
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
      districtGroupsEl.innerHTML = '<p class="picker-empty">No projects match your search.</p>';
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
    return [...selected]
      .map((id) => projectsById.get(id))
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
          // The final box ("Complete" itself, only reached when the
          // project's actual status is Completed) gets its own distinct
          // color instead of blending in as just another green "done"
          // step — a finish-line marker, not one more intermediate stage.
          const isFinalStage = index === BOOK_STAGE_LABELS.length - 1;
          cls += isFinalStage ? ' is-finished' : ' is-complete';
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
      <div class="book-page__address">${escapeHtml(displayValue(project.address))}</div>
      ${buildStepper(project)}
      <div class="book-field book-field--wide">
        <div class="book-field__label">Description</div>
        <div class="book-field__value">${escapeHtml(displayValue(project.description))}</div>
      </div>
      <div class="book-photo">
        <img src="${photoUrl}" alt="${escapeHtml(project.title)} rendering" loading="eager" onerror="this.onerror=null;this.src='${fallbackUrl}';" />
      </div>
      <div class="book-fields-grid">
        <div class="book-field"><div class="book-field__label">Est. Completion</div><div class="book-field__value">${escapeHtml(displayValue(project.completion))}</div></div>
        <div class="book-field"><div class="book-field__label">Valuation</div><div class="book-field__value">${escapeHtml(displayValue(project.valuation))}</div></div>
        <div class="book-field"><div class="book-field__label">Developer</div><div class="book-field__value">${escapeHtml(displayValue(project.developer))}</div></div>
        <div class="book-field"><div class="book-field__label">Prime Contractor</div><div class="book-field__value">${escapeHtml(displayValue(project.contractor))}</div></div>
        <div class="book-field"><div class="book-field__label">Planning Project #</div><div class="book-field__value">${escapeHtml(displayValue(project.pzProject))}</div></div>
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

  const PROJECT_PAGE_BUDGET_PX = 1056; // one full page (matches .book-page's height in book.css)
  const PROJECT_PHOTO_DEFAULT_MAX_HEIGHT_PX = 380; // must match .book-photo img's max-height in book.css
  const PROJECT_PHOTO_MIN_HEIGHT_PX = 150; // floor — below this, stop shrinking and accept the page spilling onto a 2nd sheet
  const PROJECT_PHOTO_SHRINK_STEP_PX = 20;

  // The bigger default photo size (see book.css) means a project with an
  // unusually long description, on top of a tall photo, can now push a
  // page past one sheet. Rather than leave that to chance, every generated
  // project page gets measured after its photo has actually loaded, and
  // any that run long have just their own photo shrunk (not the text, not
  // the layout) in small steps until the page fits back on one page, or
  // until the photo hits a floor small enough that shrinking further isn't
  // worth it — at that point the page is left to spill onto a 2nd sheet,
  // same safe (non-clipping) fallback as everywhere else in the book.
  async function fitOverflowingProjectPhotos() {
    const projectPages = Array.from(bookPreviewEl.querySelectorAll('.book-page--project'));
    const images = projectPages
      .map((pageEl) => pageEl.querySelector('.book-photo img'))
      .filter(Boolean);

    // An <img> with no explicit width/height reports 0 height until it has
    // actually loaded, so measuring pages before every photo is in would
    // make every page look like it already fits.
    await Promise.all(images.map((img) => (
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })
    )));

    projectPages.forEach((pageEl) => {
      const img = pageEl.querySelector('.book-photo img');
      if (!img) return;
      let maxHeight = PROJECT_PHOTO_DEFAULT_MAX_HEIGHT_PX;
      while (
        pageEl.getBoundingClientRect().height > PROJECT_PAGE_BUDGET_PX
        && maxHeight > PROJECT_PHOTO_MIN_HEIGHT_PX
      ) {
        maxHeight = Math.max(maxHeight - PROJECT_PHOTO_SHRINK_STEP_PX, PROJECT_PHOTO_MIN_HEIGHT_PX);
        img.style.maxHeight = `${maxHeight}px`;
      }
    });
  }

  async function renderBook(plan, opts) {
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
    bookPreviewEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Printing before photos are fit could ship a page that still spills
    // onto a 2nd sheet even though the shrink pass would have prevented
    // it — so the Print button stays disabled, labeled as still preparing
    // (see generateBookFromCurrentUI below), until fitting is actually done.
    await fitOverflowingProjectPhotos();
    printBtn.disabled = false;
    printBtn.textContent = PRINT_BTN_READY_LABEL;
    printBtn.setAttribute('aria-busy', 'false');
  }

  // Shared by the "Generate book" button and the quick-print tiers (0/1),
  // which call this automatically once project data loads instead of
  // waiting for a click — see QUICK_MODE below.
  function generateBookFromCurrentUI() {
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

    // Show the Print button right away, in a disabled "still working" state,
    // instead of leaving it invisible until the whole book — including every
    // project photo — has finished loading. That left the button looking
    // like it hadn't appeared yet rather than like a book was on its way.
    printBtn.hidden = false;
    printBtn.disabled = true;
    printBtn.textContent = PRINT_BTN_LOADING_LABEL;
    printBtn.setAttribute('aria-busy', 'true');
    generateBtn.disabled = true;
    const plan = computeBookPlan(selectedProjects, opts);
    renderBook(plan, opts).finally(() => {
      generateBtn.disabled = false;
    });
  }

  generateBtn.addEventListener('click', generateBookFromCurrentUI);
  printBtn.addEventListener('click', () => window.print());

  // ---------- quick-print tiers ----------
  // 0 (no ?quickmode param): quick, no way to reach the picker at all —
  //    the link meant for public sharing.
  // 1 (?quickmode=1): quick, but with a "Customize this book" escape
  //    hatch — cover title/subtitle stay locked even once revealed.
  //    Linked from the public map.
  // 2 (?quickmode=2): today's original behavior — picker shown first,
  //    nothing generated until the user clicks Generate. Linked from
  //    the admin panel.
  const QUICK_MODE = document.documentElement.dataset.quickMode || '0';

  if (QUICK_MODE === '1') {
    bookTitleEl.readOnly = true;
    bookSubtitleEl.readOnly = true;

    const revealBtn = document.getElementById('revealCustomizeBtn');
    const customizeBar = document.getElementById('quickCustomizeBar');
    revealBtn?.addEventListener('click', () => {
      document.documentElement.classList.remove('builder-hidden');
      // Not the `hidden` attribute — book.css's html[data-quick-mode="1"]
      // .quick-customize-bar rule has higher specificity than the
      // browser's default [hidden] { display: none }, so it would win and
      // the bar would stay visible. An inline style always wins instead.
      if (customizeBar) customizeBar.style.display = 'none';
      document.querySelector('.book-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

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

      projectsById = new Map(allProjects.map((project) => [project.__id, project]));

      // Default selection: the projects that would actually appear in a
      // book like the source document — assigned to one of the five
      // commissioner districts, not Expired/Withdrawn, and marked Featured.
      // Everything else (unassigned "Other Projects", non-featured
      // projects) is still pickable, just opt-in.
      allProjects.forEach((project) => {
        if (project.districtNumber && !HIDDEN_BY_DEFAULT_STATUSES.includes(project.status) && isProjectFeatured(project)) {
          selected.add(project.__id);
        }
      });

      renderStatusFilters();
      renderFeaturedFilters();
      renderPicker();

      if (QUICK_MODE === '0' || QUICK_MODE === '1') {
        generateBookFromCurrentUI();
      }
    })
    .catch((error) => {
      console.error(error);
      districtGroupsEl.innerHTML = '<p class="picker-empty">Unable to load project data. Try reloading the page.</p>';
    });
})();
