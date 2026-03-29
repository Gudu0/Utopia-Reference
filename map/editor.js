// ============================================================
//  editor.js — Node editor modal
//  Handles: modal open/close, tab switching, manual node
//  entry, load existing JSON, output/preview, copy JSON.
// ============================================================

// ============================================================
//  RESOURCE LIST — edit this to add/remove resource names.
//  Add a new type by adding a new key with an array of names.
//  TYPE_COLORS in map.js must also have an entry for new types.
// ============================================================
const RESOURCE_LIST = {
  mineral: [
    'Iron Mine', 'Stone Mine', 'Silver Mine', 'Gold Mine',
    'Crystal Mine', 'Obsidian Mine', 'Fire Magic Mine',
    'Coal Mine', 'Steam Stone Mine',
  ],
  food: [
    'Blueberry Bush', 'Strawberry Bush', 'Blackberry Bush',
    'Grapes', 'Soybean', 'Chilli', 'Watermelon',
    'Coconut', 'Wheat', 'Pepper', 'Mushroom',
  ],
  tree: [
    'Oak Tree', 'Pine Tree', 'Ancient Tree',
    'Rubber Tree', 'Crystal Branch Tree',
  ],
  plant:    [],
  creature: [],
  chest: [
    'Silver Chest', 'Gold Chest', 'Relic Chest', 'Treasure Chest',
  ],
  fishing: ['Fishing Spot'],
  other:   [],
};

const TYPE_COLORS = {
  mineral: '#a0a0c0', food: '#6abf69', tree: '#8d6e3f',
  plant: '#4caf50', creature: '#e57373', chest: '#ffd54f',
  fishing: '#4fc3f7', other: '#b0b0b0',
};

// ── State ────────────────────────────────────────────────────
let workingNodes = [];
let nextId       = 1;

// ── Modal open / close ───────────────────────────────────────
const modal = document.getElementById('editor-modal');

function openModal()  { modal.style.display = 'flex'; }
function closeModal() { modal.style.display = 'none'; }

document.getElementById('node-editor-btn').addEventListener('click', openModal);
document.getElementById('close-modal-btn').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) openModal();
});

// ── Tab switching ────────────────────────────────────────────
document.querySelectorAll('.modal-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.pane).classList.add('active');
    // Notify scan.js if the scan tab was opened (scan.js listens for this)
    if (tab.dataset.pane === 'pane-scan') {
      document.dispatchEvent(new CustomEvent('scan-tab-opened'));
    }
  });
});

// ── Build type + name dropdowns ──────────────────────────────
function buildTypeSelect(selectId, nameSelectId, nameManualId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '';
  Object.keys(RESOURCE_LIST).forEach(type => {
    const opt = document.createElement('option');
    opt.value       = type;
    opt.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () =>
    rebuildNameSelect(sel.value, nameSelectId, nameManualId)
  );
  rebuildNameSelect(sel.value, nameSelectId, nameManualId);
}

function rebuildNameSelect(type, nameSelectId, nameManualId) {
  const names = RESOURCE_LIST[type] || [];
  const sel   = document.getElementById(nameSelectId);
  sel.innerHTML = '';
  names.forEach(n => {
    const o = document.createElement('option');
    o.value = o.textContent = n;
    sel.appendChild(o);
  });
  const other = document.createElement('option');
  other.value = '__other__';
  other.textContent = '— type manually —';
  sel.appendChild(other);
  sel.dispatchEvent(new Event('change'));
}

function wireManualInput(nameSelectId, nameManualId) {
  document.getElementById(nameSelectId).addEventListener('change', function () {
    document.getElementById(nameManualId).style.display =
      this.value === '__other__' ? 'block' : 'none';
  });
}

buildTypeSelect('node-type', 'node-name', 'node-name-manual');
wireManualInput('node-name', 'node-name-manual');

// scan dropdowns are built here too so scan.js doesn't need to duplicate this
buildTypeSelect('scan-type', 'scan-name', 'scan-name-manual');
wireManualInput('scan-name', 'scan-name-manual');

// ── Load existing JSON ───────────────────────────────────────
document.getElementById('load-existing-btn').addEventListener('click', () => {
  const a = document.getElementById('load-existing-area');
  a.style.display = a.style.display === 'none' ? 'flex' : 'none';
});

document.getElementById('confirm-load-btn').addEventListener('click', () => {
  try {
    const parsed = JSON.parse(
      document.getElementById('existing-json-input').value.trim()
    );
    if (!Array.isArray(parsed)) throw new Error();
    workingNodes = parsed;
    nextId = parsed.reduce((m, n) => Math.max(m, n.id || 0), 0) + 1;
    document.getElementById('load-existing-area').style.display = 'none';
    document.getElementById('existing-json-input').value = '';
    showStatus(`Loaded ${parsed.length} nodes.`);
    refreshOutput();
  } catch {
    showStatus('Invalid JSON.', true);
  }
});

// ── Manual add ───────────────────────────────────────────────
document.getElementById('add-node-btn').addEventListener('click', () => {
  const nameEl = document.getElementById('node-name');
  const name   = nameEl.value === '__other__'
    ? document.getElementById('node-name-manual').value.trim()
    : nameEl.value;
  const type   = document.getElementById('node-type').value;
  const island = document.getElementById('node-island').value;
  const layer  = document.getElementById('node-layer').value;
  const x      = parseInt(document.getElementById('node-x').value, 10);
  const y      = parseInt(document.getElementById('node-y').value, 10);
  const notes  = document.getElementById('node-notes').value.trim();

  if (!name)               return showStatus('Name required.', true);
  if (!island)             return showStatus('Select an island.', true);
  if (isNaN(x) || isNaN(y)) return showStatus('X and Y required.', true);

  // Dupe check against allNodes (map JSON) and workingNodes (session)
  const DUPE_TOL = 2;
  const dupeInMap     = typeof allNodes !== 'undefined' && allNodes.find(
    n => Math.abs(n.x - x) <= DUPE_TOL && Math.abs(n.y - y) <= DUPE_TOL
  );
  const dupeInSession = workingNodes.find(
    n => Math.abs(n.x - x) <= DUPE_TOL && Math.abs(n.y - y) <= DUPE_TOL
  );
  const dupe = dupeInMap || dupeInSession;
  if (dupe) {
    const where = dupeInMap ? 'on map' : 'in session';
    // Show warning but don't block — user can add again to confirm
    showStatus(`Warning: possible dupe of "${dupe.name}" ${where} (${dupe.x}, ${dupe.y}). Add again to confirm.`, true);
    // Use a flag to allow second click to force-add
    if (!document.getElementById('add-node-btn').dataset.dupeWarned) {
      document.getElementById('add-node-btn').dataset.dupeWarned = '1';
      return;
    }
    delete document.getElementById('add-node-btn').dataset.dupeWarned;
  } else {
    delete document.getElementById('add-node-btn').dataset.dupeWarned;
  }

  addNode({ name, type, island, layer, notes, x, y });
  document.getElementById('node-x').value     = '';
  document.getElementById('node-y').value     = '';
  document.getElementById('node-notes').value = '';
  document.getElementById('node-x').focus();
  showStatus(`Added: ${name} (${x}, ${y})`);
});

['node-x', 'node-y'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    delete document.getElementById('add-node-btn').dataset.dupeWarned;
  });
});
['node-x', 'node-y'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-node-btn').click();
  });
});

// ── addNode — called by editor.js and scan.js ────────────────
function addNode(fields) {
  workingNodes.push({ id: nextId++, ...fields });
  refreshOutput();
}

// ── Output / preview ─────────────────────────────────────────
function refreshOutput() {
  document.getElementById('json-output').textContent =
    JSON.stringify(workingNodes, null, 2);
  document.getElementById('node-count').textContent = workingNodes.length;

  const list = document.getElementById('node-preview-list');
  if (workingNodes.length === 0) {
    list.innerHTML = '<div style="font-size:0.78rem;color:#9fb0c2">No nodes yet.</div>';
    return;
  }

  list.innerHTML = '';
  [...workingNodes].reverse().slice(0, 30).forEach(node => {
    const color = TYPE_COLORS[node.type] || '#b0b0b0';
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.8rem;padding:4px 6px;border-radius:4px;background:#202c38';
    d.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
      <span style="flex:1;color:#e8eef5">${node.name}</span>
      <span style="color:#9fb0c2;font-family:monospace;font-size:0.72rem">(${node.x},${node.y})</span>
      <button data-id="${node.id}" style="background:none;border:none;color:#666;cursor:pointer;font-size:0.9rem;padding:0 2px">✕</button>
    `;
    d.querySelector('button').addEventListener('click', () => {
      workingNodes = workingNodes.filter(n => n.id !== node.id);
      refreshOutput();
    });
    list.appendChild(d);
  });
}

// ── Copy JSON ────────────────────────────────────────────────
document.getElementById('copy-json-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(
    document.getElementById('json-output').textContent
  ).then(() => showStatus('Copied!'))
   .catch(() => {
     window.getSelection().selectAllChildren(
       document.getElementById('json-output')
     );
     showStatus('Press ⌘C to copy.');
   });
});

// ── Status message ───────────────────────────────────────────
let statusTimer;
function showStatus(msg, err = false) {
  const el = document.getElementById('editor-status');
  el.textContent = msg;
  el.style.color = err ? '#e57373' : '#6fcf97';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 3000);
}

// ── Init ─────────────────────────────────────────────────────
refreshOutput();
// ── Info modal ───────────────────────────────────────────────
const infoModal = document.getElementById('info-modal');
document.getElementById('info-btn').addEventListener('click', () => {
  infoModal.style.display = 'flex';
});
document.getElementById('close-info-btn').addEventListener('click', () => {
  infoModal.style.display = 'none';
});
infoModal.addEventListener('click', e => {
  if (e.target === infoModal) infoModal.style.display = 'none';
});