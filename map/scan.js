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
const CROP_Y = 366;  // pixels from top edge
const CROP_W = 177;  // width of crop region
const CROP_H =  51;  // height of crop region
const SCALE  =   3;  // upscale before OCR — sharpens small text

let scanResults    = [];
let tesseractReady = false;
let tesseractWorker = null;

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

  setScanProgress(`Done — ${scanResults.length} result${scanResults.length !== 1 ? 's' : ''}.`);
  const addAllBtn = document.getElementById('scan-add-all-btn');
  if (addAllBtn) addAllBtn.style.display = scanResults.length ? 'block' : 'none';
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
        try {
          const { data: { text } } = await tesseractWorker.recognize(canvas);
          coords = parseCoords(text);
        } catch (err) { /* OCR failed for this image — coords stays null */ }

        const result = { thumbUrl, coords, added: false, file: file.name };
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
  row.className   = 'scan-result-row';
  row.dataset.idx = idx;

  const coordText  = result.coords
    ? `(${result.coords.x}, ${result.coords.y})`
    : '⚠ not found';
  const coordColor = result.coords ? '#6fcf97' : '#e57373';

  row.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;min-width:0">
      <img class="scan-thumb" src="${result.thumbUrl}" title="OCR crop region" />
      <div style="min-width:0">
        <div class="scan-result-coords" style="color:${coordColor}">${coordText}</div>
        <div class="scan-result-status"
          style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${result.file}
        </div>
      </div>
    </div>
    ${result.coords
      ? `<button class="scan-add-btn" data-idx="${idx}">Add</button>`
      : '<span style="font-size:0.72rem;color:#e57373">edit manually</span>'
    }
  `;

  const addBtn = row.querySelector('.scan-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => addFromScan(idx, addBtn));

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

  if (!name)   { alert('Pick a resource name first.'); return; }
  if (!island) { alert('Pick an island first.'); return; }

  // addNode is defined in editor.js and available globally
  addNode({ name, type, island, notes: '', x: result.coords.x, y: result.coords.y });
  result.added = true;
  if (btn) { btn.textContent = '✓'; btn.classList.add('added'); btn.disabled = true; }
}

// ── Add all results at once ──────────────────────────────────
const addAllBtn = document.getElementById('scan-add-all-btn');
if (addAllBtn) {
  addAllBtn.addEventListener('click', () => {
    let added = 0;
    scanResults.forEach((result, idx) => {
      if (result.added || !result.coords) return;
      const row    = document.querySelector(`.scan-result-row[data-idx="${idx}"]`);
      const btn    = row ? row.querySelector('.scan-add-btn') : null;
      addFromScan(idx, btn);
      added++;
    });
    if (added) showStatus(`Added ${added} nodes from scans.`);
    // Switch to output tab
    const outputTab = document.querySelector('[data-pane="pane-output"]');
    if (outputTab) outputTab.click();
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
