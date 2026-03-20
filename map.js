// ============================================================
//  map.js  —  Utopia: Origin Resource Map
// ============================================================
//
//  COORDINATE SYSTEM:
//    Nodes use game coordinates directly — the (X, Y) pair
//    shown on your in-game minimap. Just read them off the
//    screen and paste into map-nodes.json.
//
//  MAP IMAGE (optional):
//    Set MAP_IMAGE to your image path when you have one.
//    Set MAP_IMAGE = null to use the grid placeholder instead.
//    Set GAME_MAX_X / GAME_MAX_Y to the real world bounds
//    once you know them (explore to the corners to find out).
//
//  The coordinate display in the bottom-right of the map
//  shows live game coords as you move your mouse — no
//  browser console needed.
// ============================================================

// ── CONFIG ───────────────────────────────────────────────────

const MAP_IMAGE  = images/beia_map_TEMPORARY.png;   // e.g. 'images/beia-map.jpg' — null = grid placeholder
const GAME_MIN_X = 0;
const GAME_MIN_Y = 0;
const GAME_MAX_X = 20000; // update once you know the real world edge
const GAME_MAX_Y = 20000;

// ── TYPE COLORS ───────────────────────────────────────────────

const TYPE_CONFIG = {
  mineral:  { color: '#a0a0c0', label: 'Mineral'  },
  food:     { color: '#6abf69', label: 'Food'      },
  wood:     { color: '#8d6e3f', label: 'Wood'      },
  plant:    { color: '#4caf50', label: 'Plant'     },
  creature: { color: '#e57373', label: 'Creature'  },
  chest:    { color: '#ffd54f', label: 'Chest'     },
  fishing:  { color: '#4fc3f7', label: 'Fishing'   },
  other:    { color: '#b0b0b0', label: 'Other'     },
};

// ── STATE ─────────────────────────────────────────────────────

let allNodes     = [];
let allMarkers   = [];
let activeTypes  = new Set(Object.keys(TYPE_CONFIG));
let activeIsland = 'all';
let searchText   = '';

// ── COORDINATE CONVERSION ─────────────────────────────────────
//
//  Leaflet CRS.Simple uses [lat, lng] where lat increases
//  upward. Game Y=0 is at the top, so we invert it.
//  If markers appear vertically mirrored when you add a real
//  map image, just swap to:  return [gy, gx];
//  COMMENT IS OUTDATED, PLEASE FIX
function gameToLatLng(gx, gy) {
  return [gy, gx];  // Y maps directly — increases upward in both systems
}
function latLngToGame(latlng) {
  return {
    x: Math.round(latlng.lng),
    y: Math.round(latlng.lat),
  };
}

// ── LEAFLET MAP ───────────────────────────────────────────────

const map = L.map('map', {
  crs:     L.CRS.Simple,
  minZoom: -4,
  maxZoom:  3,
  zoomSnap: 0.5,
});

const worldBounds = [
  [0,          GAME_MIN_X],
  [GAME_MAX_Y, GAME_MAX_X],
];

if (MAP_IMAGE) {
  L.imageOverlay(MAP_IMAGE, worldBounds).addTo(map);
} else {
  drawGridPlaceholder();
}

map.fitBounds(worldBounds);

// ── GRID PLACEHOLDER ──────────────────────────────────────────
//  Shown when MAP_IMAGE is null. Draws a labeled coordinate
//  grid so nodes are still visually positioned correctly.

function drawGridPlaceholder() {
  // Background
  L.rectangle(worldBounds, {
    color:       '#3a3a4a',
    weight:      1,
    fillColor:   '#1a1a2a',
    fillOpacity: 1,
  }).addTo(map);

  const step = 2000;

  for (let gx = GAME_MIN_X; gx <= GAME_MAX_X; gx += step) {
    L.polyline([gameToLatLng(gx, GAME_MIN_Y), gameToLatLng(gx, GAME_MAX_Y)], {
      color:   '#2e2e3e',
      weight:  gx % 10000 === 0 ? 2 : 1,
      opacity: 0.9,
    }).addTo(map);

    if (gx % 4000 === 0) {
      L.marker(gameToLatLng(gx, GAME_MAX_Y - 500), {
        icon: L.divIcon({
          html:       `<span style="color:#555;font-size:10px;white-space:nowrap">${gx}</span>`,
          className:  '',
          iconAnchor: [0, 0],
        }),
      }).addTo(map);
    }
  }

  for (let gy = GAME_MIN_Y; gy <= GAME_MAX_Y; gy += step) {
    L.polyline([gameToLatLng(GAME_MIN_X, gy), gameToLatLng(GAME_MAX_X, gy)], {
      color:   '#2e2e3e',
      weight:  gy % 10000 === 0 ? 2 : 1,
      opacity: 0.9,
    }).addTo(map);

    if (gy % 4000 === 0) {
      L.marker(gameToLatLng(GAME_MIN_X + 150, gy), {
        icon: L.divIcon({
          html:       `<span style="color:#555;font-size:10px;white-space:nowrap">${gy}</span>`,
          className:  '',
          iconAnchor: [0, 8],
        }),
      }).addTo(map);
    }
  }

  // Center label
  L.marker(gameToLatLng(GAME_MAX_X / 2, GAME_MAX_Y / 2), {
    icon: L.divIcon({
      html:       `<span style="color:#444;font-size:13px;white-space:nowrap">map image not loaded — grid placeholder</span>`,
      className:  '',
      iconAnchor: [170, 8],
    }),
  }).addTo(map);
}

// ── ON-SCREEN COORDINATE DISPLAY ─────────────────────────────
//  Live game-coord readout in the bottom-right corner.
//  Replaces the need for the browser console entirely.

const coordDisplay = L.control({ position: 'bottomright' });
coordDisplay.onAdd = function () {
  const div = L.DomUtil.create('div');
  div.style.cssText = [
    'background:rgba(20,20,30,0.88)',
    'color:#ccc',
    'font-size:12px',
    'font-family:monospace',
    'padding:5px 10px',
    'border-radius:6px',
    'border:1px solid #333',
    'pointer-events:none',
    'min-width:150px',
    'text-align:right',
    'letter-spacing:0.03em',
  ].join(';');
  div.innerHTML = 'hover for coords';
  this._div = div;
  return div;
};
coordDisplay.addTo(map);

map.on('mousemove', function (e) {
  const g = latLngToGame(e.latlng);
  const x = Math.max(GAME_MIN_X, Math.min(GAME_MAX_X, g.x));
  const y = Math.max(GAME_MIN_Y, Math.min(GAME_MAX_Y, g.y));
  coordDisplay._div.innerHTML = `(${x},&nbsp;${y})`;
});

map.on('mouseout', function () {
  coordDisplay._div.innerHTML = 'hover for coords';
});

// ── MARKER CREATION ───────────────────────────────────────────

function makeIcon(type) {
  const cfg   = TYPE_CONFIG[type] || TYPE_CONFIG.other;
  const svg   = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
    <circle cx="9" cy="9" r="7" fill="${cfg.color}" stroke="#222" stroke-width="1.5"/>
  </svg>`;
  return L.divIcon({
    html:        svg,
    className:   '',
    iconSize:    [18, 18],
    iconAnchor:  [9,  9],
    popupAnchor: [0, -10],
  });
}

function makePopupHTML(node) {
  const cfg   = TYPE_CONFIG[node.type] || TYPE_CONFIG.other;
  const notes = node.notes ? `<div class="popup-notes">${node.notes}</div>` : '';
  return `
    <div class="popup-name">${node.name}</div>
    <div class="popup-type" style="color:${cfg.color}">${cfg.label}</div>
    <div class="popup-island">📍 ${node.island}</div>
    <div style="font-size:0.78rem;color:#888;margin-top:2px;font-family:monospace">
      (${node.x}, ${node.y})
    </div>
    ${notes}
  `;
}

// ── FILTER / SEARCH ───────────────────────────────────────────

function updateVisibility() {
  let visible = 0;

  allNodes.forEach((node, i) => {
    const marker      = allMarkers[i];
    const typeMatch   = activeTypes.has(node.type || 'other');
    const islandMatch = activeIsland === 'all' || node.island === activeIsland;
    const searchMatch = searchText === ''
      || node.name.toLowerCase().includes(searchText)
      || (node.island || '').toLowerCase().includes(searchText)
      || (node.notes  || '').toLowerCase().includes(searchText);

    if (typeMatch && islandMatch && searchMatch) { marker.addTo(map); visible++; }
    else                                         { marker.remove();              }
  });

  const el = document.getElementById('result-count');
  if (el) el.textContent = `${visible} of ${allNodes.length} nodes shown`;
}

// ── SIDEBAR UI ────────────────────────────────────────────────

function buildTypeFilters(types) {
  const list = document.getElementById('filter-list');
  if (!list) return;
  list.innerHTML = '';

  const order  = Object.keys(TYPE_CONFIG);
  const sorted = [...types].sort((a, b) => {
    return (order.indexOf(a) ?? 99) - (order.indexOf(b) ?? 99);
  });

  sorted.forEach(type => {
    const cfg  = TYPE_CONFIG[type] || TYPE_CONFIG.other;
    const item = document.createElement('label');
    item.className = 'filter-item';

    const cb        = document.createElement('input');
    cb.type         = 'checkbox';
    cb.checked      = true;
    cb.dataset.type = type;
    cb.addEventListener('change', () => {
      if (cb.checked) activeTypes.add(type);
      else            activeTypes.delete(type);
      updateVisibility();
    });

    const dot              = document.createElement('span');
    dot.className          = 'type-dot';
    dot.style.background   = cfg.color;

    item.appendChild(cb);
    item.appendChild(dot);
    item.appendChild(document.createTextNode(cfg.label));
    list.appendChild(item);
  });
}

function buildIslandFilter(islands) {
  const sel = document.getElementById('island-select');
  if (!sel) return;
  [...islands].sort().forEach(island => {
    const opt       = document.createElement('option');
    opt.value       = island;
    opt.textContent = island;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    activeIsland = sel.value;
    updateVisibility();
  });
}

// ── LOAD NODES ────────────────────────────────────────────────

async function loadNodes() {
  let data;
  try {
    const res = await fetch('map-nodes.json');
    data = await res.json();
  } catch (err) {
    console.error('Could not load map-nodes.json:', err);
    return;
  }

  allNodes   = data;
  allMarkers = [];

  const typesFound   = new Set();
  const islandsFound = new Set();

  data.forEach(node => {
    const type = node.type || 'other';
    typesFound.add(type);
    if (node.island) islandsFound.add(node.island);

    const marker = L.marker(gameToLatLng(node.x, node.y), { icon: makeIcon(type) });
    marker.bindPopup(makePopupHTML(node));
    marker.addTo(map);
    allMarkers.push(marker);
  });

  buildTypeFilters(typesFound);
  buildIslandFilter(islandsFound);
  activeTypes = new Set(typesFound);
  updateVisibility();
}

// ── SEARCH ────────────────────────────────────────────────────

const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    searchText = searchInput.value.toLowerCase().trim();
    updateVisibility();
  });
}

// ── MOBILE SIDEBAR TOGGLE ─────────────────────────────────────

const sidebar   = document.getElementById('sidebar');
const toggleBtn = document.getElementById('sidebar-toggle');
if (toggleBtn && sidebar) {
  toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  map.on('click', () => {
    if (window.innerWidth <= 640) sidebar.classList.remove('open');
  });
}

// ── GO ────────────────────────────────────────────────────────

loadNodes();
