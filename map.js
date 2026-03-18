// ============================================================
//  map.js  —  Utopia: Origin Resource Map
// ============================================================
//
//  SETUP CHECKLIST (read before using):
//
//  1. Put your Beia world map image anywhere in the repo,
//     e.g. create an "images/" folder and put it there.
//     Update MAP_IMAGE and MAP_WIDTH / MAP_HEIGHT below.
//
//  2. Coordinates in map-nodes.json use PIXEL positions
//     measured from the TOP-LEFT of your map image.
//     (x = pixels from left edge, y = pixels from top edge)
//     Use any image viewer or browser devtools to find them.
//
//  3. After you have a real image, run the page locally
//     (e.g. `npx serve .` or VS Code Live Server) and click
//     anywhere on the map — the console will log the pixel
//     coords so you can copy them into map-nodes.json.
// ============================================================

// ── CONFIG — edit these to match your map image ─────────────

const MAP_IMAGE  = 'images/beia-map.jpg'; // path to your map image file
const MAP_WIDTH  = 1600;                  // pixel width  of the image
const MAP_HEIGHT = 1200;                  // pixel height of the image

// ── TYPE COLORS — add/change as you like ────────────────────
// Keys must match the "type" values used in map-nodes.json

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

// ── STATE ────────────────────────────────────────────────────

let allNodes    = [];   // all nodes loaded from map-nodes.json
let allMarkers  = [];   // parallel array of Leaflet markers
let activeTypes = new Set(Object.keys(TYPE_CONFIG)); // all on by default
let activeIsland = 'all';
let searchText   = '';

// ── LEAFLET MAP SETUP ────────────────────────────────────────

// CRS.Simple tells Leaflet this is a flat image, not a globe
const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -3,
  maxZoom:  2,
  zoomSnap: 0.5,
});

// Leaflet CRS.Simple uses [y, x] and y=0 is at the BOTTOM.
// Our node coords are pixel [x, y] from the TOP-LEFT.
// imgToLatLng() converts between the two systems.
function imgToLatLng(x, y) {
  return [MAP_HEIGHT - y, x];
}

// Image bounds in Leaflet's coordinate system
const imageBounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];

// Add the map image as a Leaflet image overlay
L.imageOverlay(MAP_IMAGE, imageBounds).addTo(map);
map.fitBounds(imageBounds);

// Log click coordinates to the console — useful for placing nodes
map.on('click', function (e) {
  const x = Math.round(e.latlng.lng);
  const y = Math.round(MAP_HEIGHT - e.latlng.lat);
  console.log(`Clicked: x=${x}, y=${y}`);
});

// ── MARKER CREATION ──────────────────────────────────────────

function makeIcon(type) {
  const cfg   = TYPE_CONFIG[type] || TYPE_CONFIG.other;
  const color = cfg.color;

  // SVG circle as the marker — no image files needed
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7" fill="${color}" stroke="#222" stroke-width="1.5"/>
    </svg>`;

  return L.divIcon({
    html:      svg,
    className: '',          // clear Leaflet's default white box
    iconSize:  [18, 18],
    iconAnchor:[9, 9],
    popupAnchor:[0, -10],
  });
}

function makePopupHTML(node) {
  const typeCfg = TYPE_CONFIG[node.type] || TYPE_CONFIG.other;
  const notes   = node.notes ? `<div class="popup-notes">${node.notes}</div>` : '';
  return `
    <div class="popup-name">${node.name}</div>
    <div class="popup-type" style="color:${typeCfg.color}">${typeCfg.label}</div>
    <div class="popup-island">📍 ${node.island}</div>
    ${notes}
  `;
}

// ── FILTER / SEARCH LOGIC ────────────────────────────────────

function updateVisibility() {
  let visible = 0;

  allNodes.forEach((node, i) => {
    const marker = allMarkers[i];

    const typeMatch   = activeTypes.has(node.type || 'other');
    const islandMatch = activeIsland === 'all' || node.island === activeIsland;
    const searchMatch = searchText === ''
      || node.name.toLowerCase().includes(searchText)
      || (node.island || '').toLowerCase().includes(searchText)
      || (node.notes  || '').toLowerCase().includes(searchText);

    if (typeMatch && islandMatch && searchMatch) {
      marker.addTo(map);
      visible++;
    } else {
      marker.remove();
    }
  });

  const countEl = document.getElementById('result-count');
  if (countEl) {
    countEl.textContent = `${visible} of ${allNodes.length} nodes shown`;
  }
}

// ── SIDEBAR UI BUILDING ──────────────────────────────────────

function buildTypeFilters(types) {
  const list = document.getElementById('filter-list');
  if (!list) return;
  list.innerHTML = '';

  // Sort types so known ones come first in TYPE_CONFIG order
  const sorted = [...types].sort((a, b) => {
    const keys = Object.keys(TYPE_CONFIG);
    return (keys.indexOf(a) ?? 99) - (keys.indexOf(b) ?? 99);
  });

  sorted.forEach(type => {
    const cfg   = TYPE_CONFIG[type] || TYPE_CONFIG.other;
    const item  = document.createElement('label');
    item.className = 'filter-item';

    const cb    = document.createElement('input');
    cb.type     = 'checkbox';
    cb.checked  = true;
    cb.dataset.type = type;

    cb.addEventListener('change', () => {
      if (cb.checked) activeTypes.add(type);
      else            activeTypes.delete(type);
      updateVisibility();
    });

    const dot   = document.createElement('span');
    dot.className = 'type-dot';
    dot.style.background = cfg.color;

    const label = document.createTextNode(cfg.label);

    item.appendChild(cb);
    item.appendChild(dot);
    item.appendChild(label);
    list.appendChild(item);
  });
}

function buildIslandFilter(islands) {
  const sel = document.getElementById('island-select');
  if (!sel) return;

  [...islands].sort().forEach(island => {
    const opt = document.createElement('option');
    opt.value       = island;
    opt.textContent = island;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    activeIsland = sel.value;
    updateVisibility();
  });
}

// ── LOAD NODES FROM JSON ─────────────────────────────────────

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

    const latlng = imgToLatLng(node.x, node.y);
    const marker = L.marker(latlng, { icon: makeIcon(type) });
    marker.bindPopup(makePopupHTML(node));
    marker.addTo(map);

    allMarkers.push(marker);
  });

  buildTypeFilters(typesFound);
  buildIslandFilter(islandsFound);
  activeTypes = new Set(typesFound); // start with all types active
  updateVisibility();
}

// ── SEARCH INPUT ─────────────────────────────────────────────

const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    searchText = searchInput.value.toLowerCase().trim();
    updateVisibility();
  });
}

// ── MOBILE SIDEBAR TOGGLE ────────────────────────────────────

const sidebar       = document.getElementById('sidebar');
const toggleBtn     = document.getElementById('sidebar-toggle');

if (toggleBtn && sidebar) {
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Close sidebar when user clicks the map on mobile
  map.on('click', () => {
    if (window.innerWidth <= 640) {
      sidebar.classList.remove('open');
    }
  });
}

// ── KICK THINGS OFF ──────────────────────────────────────────

loadNodes();
