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

// ── Edge warning thresholds ─────────────────────────────────
//  If coords are within these bounds, the row gets an edge warning.
const EDGE_LEFT   =  2000;   // x < this  → near west edge
const EDGE_RIGHT  = 19000;   // x > this  → near east edge
const EDGE_BOTTOM =  2000;   // y < this  → near south edge
const EDGE_TOP    = 18750;   // y > this  → near north edge

// ── Duplicate detection tolerance ───────────────────────────
//  Coords within +-DUPE_TOLERANCE on both axes are flagged.
const DUPE_TOLERANCE = 2;

let scanResults    = [];
let tesseractReady = false;
let tesseractWorker = null;

// -- Version --------------------------------------------------
const version = document.getElementById('version');
version.innerHTML = 'v133';

// ── Lightbox ─────────────────────────────────────────────────
const lightbox = document.createElement('div');
lightbox.id = 'scan-lightbox';
lightbox.innerHTML = `
  <div id="scan-lightbox-inner">
    <img id="scan-lightbox-img" src="" alt="Screenshot" />
    <div id="scan-lightbox-label"></div>
    <button id="scan-lightbox-close">Close</button>
  </div>
`;
document.body.appendChild(lightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.getElementById('scan-lightbox-close').addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
});
let _lightboxObjUrl = null;

function openLightbox(url, label, isObjUrl = false) {
  if (_lightboxObjUrl) { URL.revokeObjectURL(_lightboxObjUrl); _lightboxObjUrl = null; }
  _lightboxObjUrl = isObjUrl ? url : null;
  document.getElementById('scan-lightbox-img').src = url;
  document.getElementById('scan-lightbox-label').textContent = label;
  lightbox.classList.add('open');
}
function closeLightbox() {
  lightbox.classList.remove('open');
  setTimeout(() => {
    document.getElementById('scan-lightbox-img').src = '';
    if (_lightboxObjUrl) { URL.revokeObjectURL(_lightboxObjUrl); _lightboxObjUrl = null; }
  }, 200);
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

  setScanProgress('Done - ' + scanResults.length + ' result' + (scanResults.length !== 1 ? 's' : '') + '.');
  updateAddAllBtn();
}

// ── Crop + OCR a single image ────────────────────────────────
async function scanImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async e => {
      const img = new Image();
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

        // Helper: process a canvas variant, run OCR, release the canvas, return coords or null
        const tryOCR = async (processFunc) => {
          const c = document.createElement('canvas');
          c.width  = canvas.width;
          c.height = canvas.height;
          const ctx2 = c.getContext('2d');
          ctx2.drawImage(canvas, 0, 0);
          processFunc(ctx2, c);
          try {
            const { data: { text } } = await tesseractWorker.recognize(c);
            const result = parseCoords(text);
            c.width = 0; c.height = 0;
            return result;
          } catch (e) {
            c.width = 0; c.height = 0;
            return null;
          }
        };

        // Attempt 1: raw crop (no processing)
        coords = await tryOCR(() => {});

        // Attempt 2: B&W threshold at 160 — only if attempt 1 failed
        if (!coords) {
          coords = await tryOCR((ctx2, c) => {
            const imgData = ctx2.getImageData(0, 0, c.width, c.height);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
              const brightness = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
              const val = brightness > 160 ? 0 : 255;
              d[i] = d[i+1] = d[i+2] = val;
            }
            ctx2.putImageData(imgData, 0, 0);
          });
        }

        // Attempt 3: B&W threshold at 100 — only if attempt 2 also failed
        if (!coords) {
          coords = await tryOCR((ctx2, c) => {
            const imgData = ctx2.getImageData(0, 0, c.width, c.height);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
              const brightness = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
              const val = brightness > 100 ? 0 : 255;
              d[i] = d[i+1] = d[i+2] = val;
            }
            ctx2.putImageData(imgData, 0, 0);
          });
        }

        // Release the crop canvas — we have thumbUrl and coords, don't need it anymore
        canvas.width = 0; canvas.height = 0;

        // Release the full image — the FileReader result goes out of scope naturally
        // but explicitly clearing src helps mobile Safari GC
        img.src = '';

        const dupOf = coords ? findDuplicate(coords, scanResults.length) : null;
        const result = { thumbUrl, fileRef: file, coords, dupOf, added: false, file: file.name };
        scanResults.push(result);
        renderScanResult(result, scanResults.length - 1);
        resolve();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Parse "X, Y" out of OCR text ────────────────────────────
function parseCoords(text) {
  // Strip everything except digits, commas, periods, spaces
  const cleaned = text.replace(/[^\d,.\s]/g, ' ').trim();

  // Primary: X separator Y (normal case)
  const match = cleaned.match(/(\d{2,6})[,.\s]+(\d{2,6})/);
  if (match) {
    const x = parseInt(match[1], 10);
    let   y = parseInt(match[2], 10);

    // If Y looks too small (e.g. "11" when we expect 5 digits), check if
    // Tesseract split it — look for a third number immediately after
    // e.g. "5562, 11 726" -> Y should be 11726
    if (y < 1000) {
      const extMatch = cleaned.match(/(\d{2,6})[,.\s]+(\d{1,3})\s+(\d{2,4})/);
      if (extMatch) {
        const joined = parseInt(extMatch[2] + extMatch[3], 10);
        if (joined >= 1000 && joined <= 25000) y = joined;
      }
    }

    if (x >= 0 && x <= 25000 && y >= 0 && y <= 25000) return { x, y };
  }
  return null;
}

// ── Duplicate finder ─────────────────────────────────────────
//  Checks new coords against earlier scan results, workingNodes
//  (editor session), and allNodes (loaded map-nodes.json).
//  Returns a descriptive string if a match is found, else null.
function findDuplicate(coords, currentCount) {
  const { x, y } = coords;
  for (let i = 0; i < currentCount; i++) {
    const r = scanResults[i];
    if (!r.coords) continue;
    if (Math.abs(r.coords.x - x) <= DUPE_TOLERANCE &&
        Math.abs(r.coords.y - y) <= DUPE_TOLERANCE)
      return 'scan #' + (i + 1) + ' (' + r.coords.x + ', ' + r.coords.y + ')';
  }
  if (typeof workingNodes !== 'undefined') {
    for (const n of workingNodes) {
      if (Math.abs(n.x - x) <= DUPE_TOLERANCE &&
          Math.abs(n.y - y) <= DUPE_TOLERANCE)
        return '"' + n.name + '" in session (' + n.x + ', ' + n.y + ')';
    }
  }
  if (typeof allNodes !== 'undefined') {
    for (const n of allNodes) {
      if (Math.abs(n.x - x) <= DUPE_TOLERANCE &&
          Math.abs(n.y - y) <= DUPE_TOLERANCE)
        return '"' + n.name + '" on map (' + n.x + ', ' + n.y + ')';
    }
  }
  return null;
}

// ── Edge proximity check ─────────────────────────────────────
//  Returns a label string if near any edge, or null if fine.
function nearEdge(coords) {
  if (!coords) return null;
  const edges = [];
  if (coords.x < EDGE_LEFT)   edges.push('west');
  if (coords.x > EDGE_RIGHT)  edges.push('east');
  if (coords.y < EDGE_BOTTOM) edges.push('south');
  if (coords.y > EDGE_TOP)    edges.push('north');
  return edges.length ? '⚠ near ' + edges.join('/') + ' edge' : null;
}

// ── Action cell helper ───────────────────────────────────────
//  Renders the correct button(s) for a row's current state
//  and re-wires listeners. Call whenever dupe state changes.
function setActionCell(row, result, idx) {
  const existing = row.querySelector('.dupe-actions, .scan-add-btn, .scan-manual-entry');
  if (!existing || !result.coords) return;
  let el;
  if (result.dupOf && !result.dupeResolved) {
    el = document.createElement('div');
    el.className = 'dupe-actions';
    el.innerHTML = '<button class="scan-keep-btn">Keep</button><button class="scan-discard-btn">\u2715</button>';
    el.querySelector('.scan-keep-btn').addEventListener('click', () => {
      result.dupOf = null; result.dupeResolved = true;
      row.classList.remove('is-dupe');
      row.classList.toggle('is-edge', !!nearEdge(result.coords));
      const coordEl = row.querySelector('.scan-result-coords');
      if (coordEl) coordEl.style.color = '#6fcf97';
      const labelEl = row.querySelector('.scan-dupe-label'); if (labelEl) labelEl.remove();
      setActionCell(row, result, idx);
      updateAddAllBtn();
    });
    el.querySelector('.scan-discard-btn').addEventListener('click', () => {
      result.added = true; result.dupeResolved = true;
      row.style.opacity = '0.4';
      // Disable all buttons except the undiscard button
      row.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.pointerEvents = 'none'; });
      // Replace action cell with undiscard button
      const undoBtn = document.createElement('button');
      undoBtn.className = 'scan-keep-btn';
      undoBtn.textContent = 'Undo';
      undoBtn.style.pointerEvents = 'auto';
      undoBtn.disabled = false;
      undoBtn.addEventListener('click', () => {
        result.added = false;
        result.dupeResolved = !!result.dupOf;
        row.style.opacity = '';
        // Re-enable view/edit buttons
        row.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.pointerEvents = ''; });
        setActionCell(row, result, idx);
        updateAddAllBtn();
      });
      el.innerHTML = '';
      el.appendChild(undoBtn);
      updateAddAllBtn();
    });
  } else if (result.added) {
    el = document.createElement('button');
    el.className = 'scan-add-btn added';
    el.textContent = '\u2713';
    el.disabled = true;
  } else {
    el = document.createElement('button');
    el.className = 'scan-add-btn';
    el.textContent = 'Add';
    el.addEventListener('click', () => addFromScan(idx, el));
  }
  existing.replaceWith(el);
}

// ── Render one result row ────────────────────────────────────
function renderScanResult(result, idx) {
  const list = document.getElementById('scan-results');
  const row  = document.createElement('div');
  row.className   = 'scan-result-row' + (!result.coords ? ' is-missing' : result.dupOf ? ' is-dupe' : nearEdge(result.coords) ? ' is-edge' : '');
  row.dataset.idx = idx;

  const coordText  = result.coords
    ? `(${result.coords.x}, ${result.coords.y})`
    : '\u26a0 not found';
  const coordColor = result.coords
    ? (result.dupOf ? '#e5a73a' : '#6fcf97')
    : '#e57373';

  row.innerHTML = `
    <img class="scan-thumb" src="${result.thumbUrl}" title="Click to zoom crop region" />
    <div class="scan-row-inner">
      <span class="scan-row-num">#${idx + 1}</span>
      <div style="min-width:0;flex:1">
        <div class="scan-result-coords" style="color:${coordColor}">${coordText}</div>
        ${result.dupOf ? `<div class="scan-dupe-label" title="${result.dupOf}">&#9888; dupe of ${result.dupOf}</div>` : ''}
        ${nearEdge(result.coords) ? `<div class="scan-low-label">${nearEdge(result.coords)}</div>` : ''}
        <div class="scan-result-status"
          style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${result.file}
        </div>
      </div>
      ${result.coords
        ? (result.dupOf
            ? `<div class="dupe-actions">
                 <button class="scan-keep-btn" data-idx="${idx}">Keep</button>
                 <button class="scan-discard-btn" data-idx="${idx}">&#x2715;</button>
               </div>`
            : `<button class="scan-add-btn" data-idx="${idx}">Add</button>`)
        : `<div class="scan-manual-entry">
          <input class="scan-manual-x" type="number" placeholder="X" min="0" max="25000" />
          <input class="scan-manual-y" type="number" placeholder="Y" min="0" max="25000" />
          <button class="scan-manual-confirm" data-idx="${idx}">✓</button>
        </div>`
      }
      <button class="scan-view-btn" data-idx="${idx}" title="View full screenshot">🔍</button>
      <button class="scan-edit-btn" data-idx="${idx}" title="Edit coordinates" style="${result.coords ? '' : 'display:none'}">✏</button>
    </div>
  `;

  const addBtn = row.querySelector('.scan-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => addFromScan(idx, addBtn));
  const viewBtn = row.querySelector('.scan-view-btn');
  if (viewBtn) viewBtn.addEventListener('click', () =>
    (() => {
      const label = result.file + (result.coords ? ' — (' + result.coords.x + ', ' + result.coords.y + ')' : '');
      // createObjectURL gives the browser a direct reference to the file bytes —
      // no base64 inflation, much lower memory overhead than readAsDataURL.
      // We revoke the URL as soon as the lightbox closes to free the reference.
      const objUrl = URL.createObjectURL(result.fileRef);
      openLightbox(objUrl, label, true);
    })()
  );

  // Thumbnail click — opens the cropped OCR region fullscreen so coords are readable
  const thumb = row.querySelector('.scan-thumb');
  if (thumb) thumb.addEventListener('click', () =>
    openLightbox(result.thumbUrl, 'OCR crop — ' + result.file + (result.coords ? ' — (' + result.coords.x + ', ' + result.coords.y + ')' : ''))
  );

  // buttons wired via setActionCell
  setActionCell(row, result, idx);

  const editBtn = row.querySelector('.scan-edit-btn');
  if (editBtn) editBtn.addEventListener('click', () => {
    // Swap coord display for inline X/Y inputs pre-filled with current values
    const coordEl = row.querySelector('.scan-result-coords');
    const currentX = result.coords ? result.coords.x : '';
    const currentY = result.coords ? result.coords.y : '';
    const editEntry = document.createElement('div');
    editEntry.className = 'scan-manual-entry scan-edit-entry';
    editEntry.innerHTML =
      '<input class="scan-manual-x" type="number" min="0" max="25000" value="' + currentX + '" />' +
      '<input class="scan-manual-y" type="number" min="0" max="25000" value="' + currentY + '" />' +
      '<button class="scan-manual-confirm">✓</button>';
    if (coordEl) coordEl.replaceWith(editEntry);
    editBtn.style.display = 'none';
    const exX = editEntry.querySelector('.scan-manual-x');
    const exY = editEntry.querySelector('.scan-manual-y');
    const exConfirm = editEntry.querySelector('.scan-manual-confirm');
    const confirmEdit = () => {
      const x = parseInt(exX.value, 10);
      const y = parseInt(exY.value, 10);
      if (isNaN(x) || isNaN(y) || x < 0 || x > 25000 || y < 0 || y > 25000) {
        exX.style.borderColor = '#e57373';
        exY.style.borderColor = '#e57373';
        return;
      }
      result.coords = { x, y };
      result.manual = true;
      // Re-run dupe check with updated coords
      result.dupOf = findDuplicate({ x, y }, idx);
      result.dupeResolved = false;
      // Restore coord display
      const newCoordEl = document.createElement('div');
      newCoordEl.className = 'scan-result-coords';
      newCoordEl.style.color = result.dupOf ? '#e5a73a' : '#6fcf97';
      newCoordEl.textContent = '(' + x + ', ' + y + ')' + (result.manual ? ' ✏' : '');
      editEntry.replaceWith(newCoordEl);
      editBtn.style.display = '';
      // Refresh low coord warning
      const existingLowEl = row.querySelector('.scan-low-label');
      if (existingLowEl) existingLowEl.remove();
      const edgeMsg = nearEdge({ x, y });
      row.classList.toggle('is-edge', !!edgeMsg);
      if (edgeMsg) {
        const lowLabel = document.createElement('div');
        lowLabel.className = 'scan-low-label';
        lowLabel.textContent = edgeMsg;
        newCoordEl.after(lowLabel);
      }
      // Update dupe state on the row
      const existingLabel = row.querySelector('.scan-dupe-label');
      if (existingLabel) existingLabel.remove();
      row.classList.remove('is-dupe');
      if (result.dupOf) {
        row.classList.add('is-dupe');
        row.classList.remove('is-edge');
        const dupeLabel = document.createElement('div');
        dupeLabel.className = 'scan-dupe-label';
        dupeLabel.title = result.dupOf;
        dupeLabel.textContent = '⚠ dupe of ' + result.dupOf;
        newCoordEl.after(dupeLabel);
      }
      setActionCell(row, result, idx);
      updateAddAllBtn();
    };
    exConfirm.addEventListener('click', confirmEdit);
    [exX, exY].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirmEdit(); }));
    exX.focus(); exX.select();
  });

  const confirmBtn = row.querySelector('.scan-manual-confirm');
  const manualX    = row.querySelector('.scan-manual-x');
  const manualY    = row.querySelector('.scan-manual-y');
  if (confirmBtn && manualX && manualY) {
    const confirmManual = () => {
      const x = parseInt(manualX.value, 10);
      const y = parseInt(manualY.value, 10);
      if (isNaN(x) || isNaN(y) || x < 0 || x > 25000 || y < 0 || y > 25000) {
        manualX.style.borderColor = '#e57373';
        manualY.style.borderColor = '#e57373';
        return;
      }
      result.coords = { x, y };
      result.manual = true;
      // Run dupe check on the newly entered coords
      result.dupOf = findDuplicate({ x, y }, idx);
      // Update coord display — show manual marker
      const coordEl = row.querySelector('.scan-result-coords');
      if (coordEl) {
        coordEl.textContent = '(' + x + ', ' + y + ') ✏';
        coordEl.style.color = result.dupOf ? '#e5a73a' : '#6fcf97';
      }
      // Coords now set — remove missing state
      row.classList.remove('is-missing');
      // Show the edit button now that we have coords
      const editBtnEl = row.querySelector('.scan-edit-btn');
      if (editBtnEl) editBtnEl.style.display = '';
      // Low coord warning
      const existingLowLabel = row.querySelector('.scan-low-label');
      if (existingLowLabel) existingLowLabel.remove();
      const edgeMsg = nearEdge({ x, y });
      row.classList.toggle('is-edge', !!edgeMsg);
      if (edgeMsg) {
        const lowLabel = document.createElement('div');
        lowLabel.className = 'scan-low-label';
        lowLabel.textContent = edgeMsg;
        const statusEl2 = row.querySelector('.scan-result-status');
        if (statusEl2) statusEl2.before(lowLabel);
      }
      const entryEl = row.querySelector('.scan-manual-entry');
      if (result.dupOf) {
        // Show as dupe — add label and keep/discard buttons
        row.classList.add('is-dupe');
        row.classList.remove('is-edge');
        const statusEl = row.querySelector('.scan-result-status');
        const dupeLabel = document.createElement('div');
        dupeLabel.className = 'scan-dupe-label';
        dupeLabel.title = result.dupOf;
        dupeLabel.textContent = '⚠ dupe of ' + result.dupOf;
        if (statusEl) statusEl.before(dupeLabel);
        const placeholder = document.createElement('span');
        placeholder.className = 'scan-add-btn'; // recognised by setActionCell
        if (entryEl) entryEl.replaceWith(placeholder);
        setActionCell(row, result, idx);
      } else {
        // Clean — swap entry for normal Add button
        const addB = document.createElement('button');
        addB.className = 'scan-add-btn'; addB.textContent = 'Add';
        addB.addEventListener('click', () => addFromScan(idx, addB));
        if (entryEl) entryEl.replaceWith(addB);
      }
      updateAddAllBtn();
    };
    confirmBtn.addEventListener('click', confirmManual);
    [manualX, manualY].forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirmManual(); });
    });
  }

  list.appendChild(row);
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
  if (btn) { btn.textContent = '\u2713'; btn.classList.add('added'); btn.disabled = true; }
  updateAddAllBtn();
}

function showScanStatus(msg) {
  const el = document.getElementById('scan-progress');
  if (!el) return;
  el.textContent  = msg;
  el.style.color  = '#e57373';
  setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 3000);
}

// ── Update Add All button state ─────────────────────────────
function updateAddAllBtn() {
  const btn = document.getElementById('scan-add-all-btn');
  if (!btn) return;
  const clearBtn = document.getElementById('scan-clear-btn');
  if (clearBtn) clearBtn.style.display = scanResults.length ? 'block' : 'none';
  const unresolved  = scanResults.filter(r => r.dupOf && !r.dupeResolved && !r.added).length;
  const missingCoords = scanResults.filter(r => !r.coords && !r.added).length;
  btn.style.display = scanResults.length ? 'block' : 'none';
  if (unresolved > 0) {
    btn.disabled = true;
    btn.textContent = 'Resolve ' + unresolved + ' duplicate' + (unresolved !== 1 ? 's' : '') + ' first';
    btn.style.borderColor = '#e5a73a';
    btn.style.color = '#e5a73a';
  } else if (missingCoords > 0) {
    btn.disabled = true;
    btn.textContent = missingCoords + ' row' + (missingCoords !== 1 ? 's' : '') + ' missing coords';
    btn.style.borderColor = '#e57373';
    btn.style.color = '#e57373';
  } else {
    btn.disabled = false;
    btn.textContent = 'Add All to Session';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

// ── Add all results at once ──────────────────────────────────
const addAllBtn = document.getElementById('scan-add-all-btn');
if (addAllBtn) {
  addAllBtn.addEventListener('click', () => {
    const unresolved = scanResults.filter(r => r.dupOf && !r.dupeResolved && !r.added).length;
    if (unresolved > 0) { showScanStatus('Resolve ' + unresolved + ' duplicate' + (unresolved !== 1 ? 's' : '') + ' first.'); return; }
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

// ── Clear scan session ──────────────────────────────────────
const clearScanBtn = document.getElementById('scan-clear-btn');
if (clearScanBtn) {
  clearScanBtn.addEventListener('click', () => {
    scanResults = [];
    document.getElementById('scan-results').innerHTML = '';
    setScanProgress('');
    updateAddAllBtn();
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