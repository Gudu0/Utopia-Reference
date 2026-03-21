// ============================================================
//  scan.js — Screenshot OCR tab
//  Depends on: editor.js being loaded first (uses addNode,
//  showStatus, RESOURCE_LIST).
//
//  CROP REGION — tuned for iPhone screenshots (1536×720).
//  The coordinate text sits under the minimap circle.
//  If reads are wrong, adjust CROP_* below and check the
//  thumbnail in each result row to see what OCR is seeing.
// ============================================================

const CROP_X = 340;  // pixels from left edge of screenshot
const CROP_Y = 391;  // pixels from top edge
const CROP_W = 199;  // width of crop region
const CROP_H =  25;  // height of crop region
const SCALE  =   3;  // upscale before OCR — sharpens small text

// ── Duplicate detection tolerance ───────────────────────────
//  Coords within ±DUPE_TOLERANCE on both axes are flagged.
//  Nodes are very close together sometimes — keep this tight.
const DUPE_TOLERANCE = 3;

let scanResults     = [];
let tesseractReady  = false;
let tesseractWorker = null;

// ── Lightbox ─────────────────────────────────────────────────
//  Single overlay element, reused for every "view" click.
const lightbox = document.createElement('div');
lightbox.id = 'scan-lightbox';
lightbox.innerHTML = `
  <div id="scan-lightbox-inner">
    <img id="scan-lightbox-img" src="" alt="Screenshot" />
    <div id="scan-lightbox-label"></div>
    <button id="scan-lightbox-close">✕ Close</button>
  </div>
`;
document.body.appendChild(lightbox);

lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});
document.getElementById('scan-lightbox-close').addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
});

function openLightbox(fullUrl, label) {
  document.getElementById('scan-lightbox-img').src   = fullUrl;
  document.getElementById('scan-lightbox-label').textContent = label;
  lightbox.classList.add('open');
}
function closeLightbox() {
  lightbox.classList.remove('open');
  // Clear src after transition so the old image doesn't flash on next open
  setTimeout(() => { document.getElementById('scan-lightbox-img').src = ''; }, 200);
}

// ── Wire up drop zone ────────────────────────────────────────
const dropZone  = document.getElementById('scan-drop-zone');
const fileInput = document.getElementById('scan-file-input');

if (dropZone && fileInput) {
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles([...e.dataTransfer.files]);
  });
  fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));
}

// ── Lazy-load Tesseract when scan tab is opened ──────────────
document.addEventListener('scan-tab-opened', async () => {
  if (!tesseractReady) {
    setScanProgress('Loading OCR engine… (first time only, ~5s)');
    await initTesseract();
  }
});

// ── Handle dropped / picked files ───────────────────────────
async function handleFiles(files) {
  const images = files.filter(f => f.type.startsWith('image/'));
  if (!images.length) return;

  if (!tesseractReady) {
    setScanProgress('Loading OCR engine… (first time only, ~5s)');
    await initTesseract();
  }

  for (let i = 0; i < images.length; i++) {
    setScanProgress(`Scanning ${i + 1} / ${images.length}…`);
    await scanImage(images[i]);
  }

  const total = scanResults.length;
  const dupes = scanResults.filter(r => r.dupOf && !r.dupeResolved).length;
  setScanProgress(
    dupes
      ? `Done — ${total} result${total !== 1 ? 's' : ''}. ⚠ ${dupes} possible duplicate${dupes !== 1 ? 's' : ''} — resolve before adding.`
      : `Done — ${total} result${total !== 1 ? 's' : ''}.`
  );

  updateAddAllBtn();
}

// ── Crop + OCR a single image ────────────────────────────────
async function scanImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async e => {
      const fullUrl = e.target.result;   // ← store full image for lightbox
      const img     = new Image();
      img.onload = async () => {
        // Crop the coord region and upscale
        const canvas  = document.createElement('canvas');
        canvas.width  = CROP_W * SCALE;
        canvas.height = CROP_H * SCALE;
        const ctx = canvas.getContext('2d');

        // White background helps OCR on light text
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          img,
          CROP_X, CROP_Y, CROP_W, CROP_H,
          0, 0, CROP_W * SCALE, CROP_H * SCALE
        );

        const thumbUrl = canvas.toDataURL('image/png');

        let coords = null;
        try {
          const { data: { text } } = await tesseractWorker.recognize(canvas);
          coords = parseCoords(text);
        } catch (err) { /* OCR failed — coords stays null */ }

        // ── Duplicate check ──────────────────────────────────
        //  dupOf: null = clean, string = label of what it duplicates
        const dupOf = coords ? findDuplicate(coords, scanResults.length) : null;

        const result = {
          thumbUrl,
          fullUrl,          // full screenshot for lightbox
          coords,
          added:        false,
          dupeResolved: false,  // true once user explicitly keeps/dismisses
          dupOf,                // null or descriptive string
          file:         file.name,
        };
        scanResults.push(result);
        renderScanResult(result, scanResults.length - 1);
        resolve();
      };
      img.src = fullUrl;
    };
    reader.readAsDataURL(file);
  });
}

// ── Duplicate finder ─────────────────────────────────────────
//  Checks new coords against:
//    1. Already-scanned results in this session (by currentCount index)
//    2. workingNodes (session nodes added via manual or scan)
//    3. allNodes (nodes loaded from map-nodes.json)
//  Returns a human-readable string describing the match, or null.

function findDuplicate(coords, currentCount) {
  const { x, y } = coords;

  // Check earlier scan results in this session
  for (let i = 0; i < currentCount; i++) {
    const r = scanResults[i];
    if (!r.coords) continue;
    if (Math.abs(r.coords.x - x) <= DUPE_TOLERANCE &&
        Math.abs(r.coords.y - y) <= DUPE_TOLERANCE) {
      return `scan result #${i + 1} (${r.coords.x}, ${r.coords.y})`;
    }
  }

  // Check working nodes (editor.js session nodes)
  if (typeof workingNodes !== 'undefined') {
    for (const n of workingNodes) {
      if (Math.abs(n.x - x) <= DUPE_TOLERANCE &&
          Math.abs(n.y - y) <= DUPE_TOLERANCE) {
        return `"${n.name}" already in session (${n.x}, ${n.y})`;
      }
    }
  }

  // Check allNodes (loaded map-nodes.json)
  if (typeof allNodes !== 'undefined') {
    for (const n of allNodes) {
      if (Math.abs(n.x - x) <= DUPE_TOLERANCE &&
          Math.abs(n.y - y) <= DUPE_TOLERANCE) {
        return `"${n.name}" already on map (${n.x}, ${n.y})`;
      }
    }
  }

  return null;
}

// ── Parse "X, Y" out of OCR text ────────────────────────────
function parseCoords(text) {
  // Tesseract may read commas as periods or add extra spaces — be flexible
  const cleaned = text.replace(/[^\d,.\s]/g, ' ').trim();
  const match   = cleaned.match(/(\d{2,6})[,.\s]+(\d{2,6})/);
  if (!match) return null;
  const x = parseInt(match[1], 10);
  const y = parseInt(match[2], 10);
  if (x < 0 || x > 25000 || y < 0 || y > 25000) return null;
  return { x, y };
}

// ── Render one result row ────────────────────────────────────
function renderScanResult(result, idx) {
  const list = document.getElementById('scan-results');
  const row  = document.createElement('div');
  row.className   = 'scan-result-row' + (result.dupOf ? ' is-dupe' : '');
  row.dataset.idx = idx;

  const coordText  = result.coords
    ? `(${result.coords.x}, ${result.coords.y})`
    : '⚠ not found';
  const coordColor = result.coords
    ? (result.dupOf ? '#e5a73a' : '#6fcf97')
    : '#e57373';

  // Right-side cell: add button, or dupe controls, or "edit manually"
  let actionCell;
  if (!result.coords) {
    actionCell = `<span style="font-size:0.72rem;color:#e57373;grid-column:2/4">edit manually</span>`;
  } else if (result.dupOf) {
    actionCell = `
      <div class="dupe-actions">
        <button class="scan-keep-btn" data-idx="${idx}" title="Not a duplicate — keep it">Keep</button>
        <button class="scan-discard-btn" data-idx="${idx}" title="Discard this result">✕</button>
      </div>
    `;
  } else {
    actionCell = `<button class="scan-add-btn" data-idx="${idx}">Add</button>`;
  }

  // View button — always present when we have a full image
  const viewBtn = `<button class="scan-view-btn" data-idx="${idx}" title="View full screenshot">🔍</button>`;

  row.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;min-width:0">
      <img class="scan-thumb" src="${result.thumbUrl}" title="OCR crop region" />
      <div style="min-width:0">
        <div class="scan-result-coords" style="color:${coordColor}">${coordText}</div>
        ${result.dupOf
          ? `<div class="scan-dupe-label" title="${result.dupOf}">⚠ possible dupe of ${result.dupOf}</div>`
          : ''
        }
        <div class="scan-result-status"
          style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${result.file}
        </div>
      </div>
    </div>
    ${actionCell}
    ${viewBtn}
  `;

  // Wire buttons
  const addBtn     = row.querySelector('.scan-add-btn');
  const keepBtn    = row.querySelector('.scan-keep-btn');
  const discardBtn = row.querySelector('.scan-discard-btn');
  const viewBtnEl  = row.querySelector('.scan-view-btn');

  if (addBtn)     addBtn.addEventListener('click',     () => addFromScan(idx, addBtn));
  if (keepBtn)    keepBtn.addEventListener('click',    () => resolveAsSafe(idx, row));
  if (discardBtn) discardBtn.addEventListener('click', () => discardScan(idx, row));
  if (viewBtnEl)  viewBtnEl.addEventListener('click',  () =>
    openLightbox(result.fullUrl, `${result.file}${result.coords ? ' — ' + coordText : ''}`)
  );

  list.appendChild(row);
}

// ── Resolve a flagged row as "keep it, it's fine" ────────────
function resolveAsSafe(idx, row) {
  const result      = scanResults[idx];
  result.dupOf      = null;
  result.dupeResolved = true;
  row.classList.remove('is-dupe');

  // Replace dupe-actions with a normal Add button
  const actionsEl = row.querySelector('.dupe-actions');
  if (actionsEl) {
    const addBtn        = document.createElement('button');
    addBtn.className    = 'scan-add-btn';
    addBtn.dataset.idx  = idx;
    addBtn.textContent  = 'Add';
    addBtn.addEventListener('click', () => addFromScan(idx, addBtn));
    actionsEl.replaceWith(addBtn);
  }

  // Update coord colour to green
  const coordEl = row.querySelector('.scan-result-coords');
  if (coordEl) coordEl.style.color = '#6fcf97';

  // Remove dupe label
  const labelEl = row.querySelector('.scan-dupe-label');
  if (labelEl) labelEl.remove();

  updateAddAllBtn();
}

// ── Discard a scan result entirely ───────────────────────────
function discardScan(idx, row) {
  scanResults[idx].added        = true;   // treat as handled so Add All skips it
  scanResults[idx].dupeResolved = true;
  row.classList.add('discarded');
  row.style.opacity = '0.35';
  // Replace controls with a label
  const actionsEl = row.querySelector('.dupe-actions');
  if (actionsEl) {
    actionsEl.innerHTML = '<span style="font-size:0.72rem;color:#9fb0c2">discarded</span>';
  }
  updateAddAllBtn();
}

// ── Add a single scan result to the session ──────────────────
function addFromScan(idx, btn) {
  const result = scanResults[idx];
  if (!result || result.added || !result.coords) return;

  const nameEl = document.getElementById('scan-name');
  const name   = nameEl.value === '__other__'
    ? document.getElementById('scan-name-manual').value.trim()
    : nameEl.value;
  const type   = document.getElementById('scan-type').value;
  const island = document.getElementById('scan-island').value;

  if (!name)   { showScanStatus('Pick a resource name first.'); return; }
  if (!island) { showScanStatus('Pick an island first.'); return; }

  addNode({ name, type, island, notes: '', x: result.coords.x, y: result.coords.y });
  result.added = true;
  if (btn) { btn.textContent = '✓'; btn.classList.add('added'); btn.disabled = true; }

  updateAddAllBtn();
}

function showScanStatus(msg) {
  const el = document.getElementById('scan-progress');
  if (!el) return;
  el.textContent  = msg;
  el.style.color  = '#e57373';
  setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 3000);
}

// ── Update Add All button state ───────────────────────────────
//  Blocked when any result has an unresolved dupe flag.
function updateAddAllBtn() {
  const btn = document.getElementById('scan-add-all-btn');
  if (!btn) return;

  const unresolvedDupes = scanResults.filter(
    r => r.dupOf && !r.dupeResolved && !r.added
  ).length;

  const hasAddable = scanResults.some(r => !r.added && r.coords && !r.dupOf);

  btn.style.display = scanResults.length ? 'block' : 'none';

  if (unresolvedDupes > 0) {
    btn.disabled         = true;
    btn.title            = `Resolve ${unresolvedDupes} flagged duplicate${unresolvedDupes !== 1 ? 's' : ''} before adding all`;
    btn.dataset.blocked  = 'true';
    btn.textContent      = `⚠ Resolve ${unresolvedDupes} duplicate${unresolvedDupes !== 1 ? 's' : ''} first`;
  } else {
    btn.disabled         = false;
    btn.title            = '';
    btn.dataset.blocked  = '';
    btn.textContent      = 'Add All';
  }
}

// ── Add all results at once ──────────────────────────────────
const addAllBtn = document.getElementById('scan-add-all-btn');
if (addAllBtn) {
  addAllBtn.addEventListener('click', () => {
    // Guard — should not be reachable while blocked, but just in case
    const unresolvedDupes = scanResults.filter(
      r => r.dupOf && !r.dupeResolved && !r.added
    ).length;
    if (unresolvedDupes > 0) {
      showScanStatus(`Resolve ${unresolvedDupes} flagged duplicate${unresolvedDupes !== 1 ? 's' : ''} before adding all.`);
      return;
    }

    const island = document.getElementById('scan-island').value;
    if (!island) { showScanStatus('Pick an island first.'); return; }

    let added = 0;
    scanResults.forEach((result, idx) => {
      if (result.added || !result.coords) return;
      const row = document.querySelector(`.scan-result-row[data-idx="${idx}"]`);
      const btn = row ? row.querySelector('.scan-add-btn') : null;
      addFromScan(idx, btn);
      added++;
    });

    if (added) {
      showStatus(`Added ${added} nodes from scans.`);
      const outputTab = document.querySelector('[data-pane="pane-output"]');
      if (outputTab) outputTab.click();
    } else {
      showScanStatus('Nothing to add — check island and name are selected.');
    }
  });
}

// ── Tesseract init ───────────────────────────────────────────
async function initTesseract() {
  if (tesseractReady) return;
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const s    = document.createElement('script');
      s.src      = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';
      s.onload   = resolve;
      s.onerror  = reject;
      document.head.appendChild(s);
    });
  }
  tesseractWorker = await Tesseract.createWorker('eng', 1, {
    tessedit_char_whitelist: '0123456789, ',
  });
  tesseractReady = true;
  setScanProgress('OCR engine ready.');
  setTimeout(() => setScanProgress(''), 2000);
}

function setScanProgress(msg) {
  const el = document.getElementById('scan-progress');
  if (el) el.textContent = msg;
}