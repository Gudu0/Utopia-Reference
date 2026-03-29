import { log } from "./log.js";
import { parse } from "https://esm.sh/jsonc-parser";


log("encyclopedia.js loaded");
const ITEMS_PER_PAGE = 20;

const state = {
    activeTab: "items",
    tabs: {
        items: {
            all: [],
            filtered: [],
            selectedId: null,
            currentPage: 1,
            search: "",
            sort: "name-asc",
            category: "all",
            subcategory: "all"
        },
        nodes: {
            all: [],
            filtered: [],
            selectedId: null,
            currentPage: 1,
            search: "",
            sort: "name-asc",
            category: "all",
            subcategory: "all"
        },
        enemies: {
            all: [],
            filtered: [],
            selectedId: null,
            currentPage: 1,
            search: "",
            sort: "name-asc",
            category: "all",
            subcategory: "all"
        }
    }
};

const els = {
    searchInput: document.getElementById("entry-search"),
    resultCount: document.getElementById("entry-result-count"),
    details: document.getElementById("entry-details"),
    itemGrid: document.getElementById("entry-grid"),
    sortFilter: document.getElementById("sort-filter"),
    pageIndicator: document.getElementById("page-indicator"),
    prevPageBtn: document.getElementById("prev-page-btn"),
    nextPageBtn: document.getElementById("next-page-btn"),
    extraFilters: document.getElementById("tab-extra-filters"),
    gridTitle: document.getElementById("grid-title"),
    tabButtons: [...document.querySelectorAll(".encyclopedia-tab")]
};


init();



// ------ NODE ----- \\\

function populateNodeCategoryFilter() {
    const tab = state.tabs.nodes;
    const categoryFilter = document.getElementById("node-category-filter");
    if (!categoryFilter) return;

    const categories = [...new Set(tab.all.map(node => node.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    categoryFilter.innerHTML = `<option value="all">All Categories</option>`;

    for (const category of categories) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    }

    categoryFilter.value = categories.includes(tab.category) ? tab.category : "all";
}

function populateNodeSubcategoryFilter() {
    const tab = state.tabs.nodes;
    const subcategoryFilter = document.getElementById("node-subcategory-filter");
    if (!subcategoryFilter) return;

    let sourceNodes = tab.all;
    if (tab.category !== "all") {
        sourceNodes = sourceNodes.filter(node => node.category === tab.category);
    }

    const subcategories = [...new Set(sourceNodes.map(node => node.subcategory).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    subcategoryFilter.innerHTML = `<option value="all">All Subcategories</option>`;

    for (const subcategory of subcategories) {
        const option = document.createElement("option");
        option.value = subcategory;
        option.textContent = subcategory;
        subcategoryFilter.appendChild(option);
    }

    if (!subcategories.includes(tab.subcategory)) {
        tab.subcategory = "all";
    }

    subcategoryFilter.value = tab.subcategory;
}

function wireNodeExtraFilters() {
    const tab = state.tabs.nodes;
    const categoryFilter = document.getElementById("node-category-filter");
    const subcategoryFilter = document.getElementById("node-subcategory-filter");

    categoryFilter.addEventListener("change", () => {
        tab.category = categoryFilter.value;
        tab.currentPage = 1;
        tab.subcategory = "all";
        renderExtraFilters();
        applyFiltersAndRender();
    });

    subcategoryFilter.addEventListener("change", () => {
        tab.subcategory = subcategoryFilter.value;
        tab.currentPage = 1;
        applyFiltersAndRender();
    });
}


// ----- ITEM ----- \\\

function foodRow(foodStats) {
    const fd = foodStats.food ?? 0;
    const wt = foodStats.water ?? 0;

    const foodClass = fd > 0 ? "food-positive" : fd < 0 ? "food-negative" : "food-neutral";
    const waterClass = wt > 0 ? "food-positive" : wt < 0 ? "food-negative" : "food-neutral";

    const html = [];
    html.push('<div class="details-stat-row">');
    html.push('<span class="details-stat-label">Food / Water</span>');
    html.push('<div class="details-stat-value">');
    html.push(`<span class="${foodClass}">${escapeHtml(fd)}</span>`);
    html.push(' / ');
    html.push(`<span class="${waterClass}">${escapeHtml(wt)}</span>`);
    html.push('</div>');
    html.push('</div>');
    return html.join("");
}

function renderSourcesSection(item) {
    if (!item.sources.length) {
        return "";
    }

    return `
        <div class="details-section">
            <h3>Sources</h3>
            <ul class="details-list">
                ${item.sources.map(source => `<li>${escapeHtml(formatEntry(source))}</li>`).join("")}
            </ul>
        </div>
    `;
}

function renderUsesSection(item) {
    if (!item.uses.length) {
        return "";
    }

    return `
        <div class="details-section">
            <h3>Uses</h3>
            <ul class="details-list">
                ${item.uses.map(use => `<li>${escapeHtml(formatEntry(use))}</li>`).join("")}
            </ul>
        </div>
    `;
}

function renderItemImage(item) {
    if (item.img) {
        return `<img src="./data/itemImages/${encodeURIComponent(item.img)}" alt="${escapeHtml(item.name)}" />`;
    }

    return `<div class="item-card-placeholder" aria-hidden="true">?</div>`;
}

function wireItemExtraFilters() {
    const tab = state.tabs.items;
    const categoryFilter = document.getElementById("category-filter");
    const subcategoryFilter = document.getElementById("subcategory-filter");

    categoryFilter.addEventListener("change", () => {
        tab.category = categoryFilter.value;
        tab.currentPage = 1;
        tab.subcategory = "all";
        renderExtraFilters();
        applyFiltersAndRender();
    });

    subcategoryFilter.addEventListener("change", () => {
        tab.subcategory = subcategoryFilter.value;
        tab.currentPage = 1;
        applyFiltersAndRender();
    });
}

async function loadItems() {
    log("about to fetch items");
    try {
        const response = await fetch("./data/itemDef.jsonc");
        if (!response.ok) {
            throw new Error(`Failed to load itemDef.jsonc (${response.status})`);
        }

        const rawText = await response.text();
        const data = parse(rawText);

        if (!Array.isArray(data)) {
            throw new Error("itemDef.jsonc root must be an array.");
        }
        log("loaded items", data);
        state.tabs.items.all = data.map(normalizeItem);
    } catch (error) {
        console.error("loadItems failed:", error);
        els.details.innerHTML = `
            <div class="details-empty">
                <div class="details-empty-icon">⚠️</div>
                <h2>Could not load items</h2>
                <p>${escapeHtml(error.message)}</p>
            </div>
        `;
        els.itemGrid.innerHTML = `<div class="grid-empty">Failed to load items.</div>`;
    }
}

function normalizeItem(item) {
    return {
        id: item.id ?? crypto.randomUUID(),
        name: item.name ?? "Unnamed Item",
        weight: item.weight ?? null,
        desc: item.desc ?? "",
        img: item.img ?? null,
        sources: Array.isArray(item.sources) ? item.sources : [],
        uses: Array.isArray(item.uses) ? item.uses : [],
        notes: item.notes ?? "",
        category: item.category ?? "Misc",
        subcategory: item.subcategory ?? "",
        rarity: item.rarity ?? null,
        durability: item.durability ?? null,
        foodStats: item.foodStats ?? null,
    };
}

function populateItemCategoryFilter() {
    const tab = state.tabs.items;
    const categoryFilter = document.getElementById("category-filter");
    if (!categoryFilter) return;

    const categories = [...new Set(tab.all.map(item => item.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    categoryFilter.innerHTML = `<option value="all">All Categories</option>`;

    for (const category of categories) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    }

    categoryFilter.value = categories.includes(tab.category) ? tab.category : "all";
}

function populateItemSubcategoryFilter() {
    const tab = state.tabs.items;
    const subcategoryFilter = document.getElementById("subcategory-filter");
    if (!subcategoryFilter) return;

    let sourceItems = tab.all;
    if (tab.category !== "all") {
        sourceItems = sourceItems.filter(item => item.category === tab.category);
    }

    const subcategories = [...new Set(sourceItems.map(item => item.subcategory).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    subcategoryFilter.innerHTML = `<option value="all">All Subcategories</option>`;

    for (const subcategory of subcategories) {
        const option = document.createElement("option");
        option.value = subcategory;
        option.textContent = subcategory;
        subcategoryFilter.appendChild(option);
    }

    if (!subcategories.includes(tab.subcategory)) {
        tab.subcategory = "all";
    }

    subcategoryFilter.value = tab.subcategory;
}


// ------ Enemy ------ \\\


// ----- Helper ------- \\\

function detailRow(label, value) {
    return `
        <div class="details-stat-row">
            <span class="details-stat-label">${escapeHtml(label)}</span>
            <span class="details-stat-value">${escapeHtml(value)}</span>
        </div>
    `;
}

function formatEntry(entry) {
    if (typeof entry === "string") {
        return entry;
    }

    if (entry && typeof entry === "object") {
        if (entry.name) {
            return entry.name;
        }

        return JSON.stringify(entry);
    }

    return String(entry);
}

function capitalizeWords(text) {
    return text.replace(/\b\w/g, char => char.toUpperCase());
}

function getTabState() {
    return state.tabs[state.activeTab];
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function switchTab(tabName) {
    if (tabName === state.activeTab) {
        return;
    }

    state.activeTab = tabName;

    renderActiveTabButton();
    renderExtraFilters();
    syncSharedControlsFromTab();
    applyFiltersAndRender();
}


function sortEntries(entries, sortMode) {
    switch (sortMode) {
        case "name-desc":
            entries.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case "name-asc":
        default:
            entries.sort((a, b) => a.name.localeCompare(b.name));
            break;
    }
}

function clampCurrentPage() {
    const tab = getTabState();
    const totalPages = getTotalPages();

    if (tab.currentPage > totalPages) tab.currentPage = totalPages;
    if (tab.currentPage < 1) tab.currentPage = 1;
}

function getTotalPages() {
    const tab = getTabState();
    return Math.max(1, Math.ceil(tab.filtered.length / ITEMS_PER_PAGE));
}

function ensureValidSelection() {
    const tab = getTabState();

    if (tab.filtered.length === 0) {
        tab.selectedId = null;
        return;
    }

    const stillExists = tab.filtered.some(entry => entry.id === tab.selectedId);
    if (!stillExists) {
        tab.selectedId = null;
    }
}

// ----- Other -------- \\\

async function init() {
    wireEvents();
    await loadItems();
    renderActiveTabButton();
    renderExtraFilters();
    syncSharedControlsFromTab();
    applyFiltersAndRender();
}

function wireEvents() {
    wireTabButtons();

    els.searchInput.addEventListener("input", () => {
        const tab = getTabState();
        tab.search = els.searchInput.value.trim().toLowerCase();
        tab.currentPage = 1;
        applyFiltersAndRender();
    });

    els.sortFilter.addEventListener("change", () => {
        const tab = getTabState();
        tab.sort = els.sortFilter.value;
        tab.currentPage = 1;
        applyFiltersAndRender();
    });

    els.prevPageBtn.addEventListener("click", () => {
        const tab = getTabState();
        if (tab.currentPage > 1) {
            tab.currentPage--;
            renderGrid();
            renderPageIndicator();
        }
    });

    els.nextPageBtn.addEventListener("click", () => {
        const tab = getTabState();
        const totalPages = getTotalPages();
        if (tab.currentPage < totalPages) {
            tab.currentPage++;
            renderGrid();
            renderPageIndicator();
        }
    });
}

function applyFiltersAndRender() {
    const tab = getTabState();
    let entries = [...tab.all];

    if (tab.search) {
        entries = entries.filter(entry => {
            const haystack = [
                entry.name,
                entry.desc,
                entry.category,
                entry.subcategory,
                entry.notes
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(tab.search);
        });
    }

    if (tab.category !== "all") {
        entries = entries.filter(entry => entry.category === tab.category);
    }

    if (tab.subcategory !== "all") {
        entries = entries.filter(entry => entry.subcategory === tab.subcategory);
    }

    sortEntries(entries, tab.sort);
    tab.filtered = entries;

    clampCurrentPage();
    ensureValidSelection();

    renderResultCount();
    renderGrid();
    renderPageIndicator();
    renderDetails();
}

function wireTabButtons() {
    for (const button of els.tabButtons) {
        button.addEventListener("click", () => {
            switchTab(button.dataset.tab);
        });
    }
}

function renderActiveTabButton() {
    for (const button of els.tabButtons) {
        const isActive = button.dataset.tab === state.activeTab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    }

    els.gridTitle.textContent = capitalizeWords(state.activeTab);
}

function syncSharedControlsFromTab() {
    const tab = getTabState();
    els.searchInput.value = tab.search;
    els.sortFilter.value = tab.sort;
}

function renderExtraFilters() {
    if (state.activeTab === "items") {
        els.extraFilters.innerHTML = `
            <div class="panel-section">
                <h3>Category</h3>
                <select id="category-filter" class="island-select">
                    <option value="all">All Categories</option>
                </select>
            </div>

            <div class="panel-section">
                <h3>Subcategory</h3>
                <select id="subcategory-filter" class="island-select">
                    <option value="all">All Subcategories</option>
                </select>
            </div>
        `;

        populateItemCategoryFilter();
        populateItemSubcategoryFilter();
        wireItemExtraFilters();
        return;
    }

    if (state.activeTab === "nodes") {
        els.extraFilters.innerHTML = `
            <div class="panel-section">
                <h3>Category</h3>
                <select id="node-category-filter" class="island-select">
                    <option value="all">All Categories</option>
                </select>
            </div>

            <div class="panel-section">
                <h3>Subcategory</h3>
                <select id="node-subcategory-filter" class="island-select">
                    <option value="all">All Subcategories</option>
                </select>
            </div>
        `;

        populateNodeCategoryFilter();
        populateNodeSubcategoryFilter();
        wireNodeExtraFilters();
        return;
    }

    els.extraFilters.innerHTML = `
        <div class="panel-section">
            <h3>Status</h3>
            <div class="result-count">Enemy tab not built yet.</div>
        </div>
    `;
}

function renderResultCount() {
    const tab = getTabState();
    const count = tab.filtered.length;
    els.resultCount.textContent = `${count} item${count === 1 ? "" : "s"}`;
}

function renderGrid() {
    const tab = getTabState();
    els.itemGrid.innerHTML = "";

    const startIndex = (tab.currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = tab.filtered.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
        els.itemGrid.innerHTML = `<div class="grid-empty">No items found.</div>`;
        return;
    }

    for (const item of pageItems) {
        const button = document.createElement("button");
        button.className = "item-card";
        if (item.id === tab.selectedId) {
            button.classList.add("selected");
        }

        button.type = "button";
        button.title = item.name;

        button.innerHTML = `
            ${renderItemImage(item)}
            <span>${escapeHtml(item.name)}</span>
        `;

        button.addEventListener("click", () => {
            tab.selectedId = item.id;
            renderGrid();
            renderDetails();
        });

        els.itemGrid.appendChild(button);
    }
}

function renderPageIndicator() {
    const tab = getTabState();
    const totalPages = getTotalPages();
    els.pageIndicator.textContent = `Page ${tab.currentPage} / ${totalPages}`;
    els.prevPageBtn.disabled = tab.currentPage <= 1;
    els.nextPageBtn.disabled = tab.currentPage >= totalPages;
}

function renderDetails() {
    const tab = getTabState();
    const item = tab.filtered.find(entry => entry.id === tab.selectedId);

    if (!item) {
        els.details.innerHTML = `
            <div class="details-empty">
                <div class="details-empty-icon">📘</div>
                <h2>Select an item</h2>
                <p>Choose something from the item list to view its info.</p>
            </div>
        `;
        return;
    }

    const metaPills = [];

    if (item.category) {
        metaPills.push(`<span class="meta-pill">${escapeHtml(item.category)}</span>`);
    }

    if (item.subcategory) {
        metaPills.push(`<span class="meta-pill">${escapeHtml(capitalizeWords(item.subcategory))}</span>`);
    }

    if (item.rarity) {
        switch(item.rarity){
            case "common":
                metaPills.push(`<span class="meta-pill rarity-common">${escapeHtml(capitalizeWords(item.rarity))}</span>`);
                break;
            case "uncommon":
                metaPills.push(`<span class="meta-pill rarity-uncommon">${escapeHtml(capitalizeWords(item.rarity))}</span>`);
                break;
            case "rare":
                metaPills.push(`<span class="meta-pill rarity-rare">${escapeHtml(capitalizeWords(item.rarity))}</span>`);
                break;
            case "epic":
                metaPills.push(`<span class="meta-pill rarity-epic">${escapeHtml(capitalizeWords(item.rarity))}</span>`);
                break;
            case "legendary":
                metaPills.push(`<span class="meta-pill rarity-legendary">${escapeHtml(capitalizeWords(item.rarity))}</span>`);
                break;
            default:
                metaPills.push(`<span class="meta-pill">${escapeHtml(capitalizeWords(item.rarity))}</span>`);
                break;
        }
    }

    els.details.innerHTML = `
        <div class="details-header">
            ${renderDetailsImage(item)}
            <div class="details-header-text">
                <h2>${escapeHtml(item.name)}</h2>
                <div class="details-meta">
                    ${metaPills.join("")}
                </div>
            </div>
        </div>

        ${renderInfoSection(item)}
        ${renderSourcesSection(item)}
        ${renderUsesSection(item)}
        ${renderNotesSection(item)}
    `;
}

function renderDetailsImage(item) {
    if (item.img) {
        return `<img class="details-image" src="./data/itemImages/${encodeURIComponent(item.img)}" alt="${escapeHtml(item.name)}" />`;
    }

    return `<div class="details-image details-image-placeholder">No Image</div>`;
}

function renderInfoSection(item) {
    const rows = [];

    if (item.weight != null) {
        rows.push(detailRow("Weight", `${item.weight} kg`));
    }

    if (item.durability != null) {
        rows.push(detailRow("Durability", String(item.durability)));
    }

    if (item.foodStats != null) {
        rows.push(foodRow(item.foodStats));
    }



    return `
        <div class="details-section">
            <h3>Overview</h3>
            <p>${escapeHtml(item.desc || "No description yet.")}</p>
            ${rows.length ? `<div class="details-stats">${rows.join("")}</div>` : ""}
        </div>
    `;
}

function renderNotesSection(item) {
    if (!item.notes) {
        return "";
    }

    return `
        <div class="details-section">
            <h3>Notes</h3>
            <p>${escapeHtml(item.notes)}</p>
        </div>
    `;
}
