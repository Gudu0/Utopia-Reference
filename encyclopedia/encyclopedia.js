import { log } from "./log.js";
import { parse } from "https://esm.sh/jsonc-parser";


log("encyclopedia.js loaded");
const ITEMS_PER_PAGE = 20;

const state = {
    allItems: [],
    filteredItems: [],
    selectedItemId: null,
    currentPage: 1,
    search: "",
    category: "all",
    subcategory: "all",
    sort: "name-asc"
};

const els = {
    searchInput: document.getElementById("entry-search"),
    sortFilter: document.getElementById("sort-filter"),
    resultCount: document.getElementById("entry-result-count"),

    details: document.getElementById("entry-details"),
    itemGrid: document.getElementById("entry-grid"),

    pageIndicator: document.getElementById("page-indicator"),
    prevPageBtn: document.getElementById("prev-page-btn"),
    nextPageBtn: document.getElementById("next-page-btn"),

    extraFilters: document.getElementById("tab-extra-filters"),
    gridTitle: document.getElementById("grid-title"),
    tabButtons: [...document.querySelectorAll(".encyclopedia-tab")]
};

init();

async function init() {
    wireEvents();
    await loadItems();
    applyFiltersAndRender();
}

function wireEvents() {
    els.searchInput.addEventListener("input", () => {
        state.search = els.searchInput.value.trim().toLowerCase();
        state.currentPage = 1;
        applyFiltersAndRender();
    });

    els.sortFilter.addEventListener("change", () => {
        state.sort = els.sortFilter.value;
        state.currentPage = 1;
        applyFiltersAndRender();
    });

    els.prevPageBtn.addEventListener("click", () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderGrid();
            renderPageIndicator();
        }
    });

    els.nextPageBtn.addEventListener("click", () => {
        const totalPages = getTotalPages();
        if (state.currentPage < totalPages) {
            state.currentPage++;
            renderGrid();
            renderPageIndicator();
        }
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
        state.allItems = data.map(normalizeItem);
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

function populateCategoryFilter() {
    const categories = [...new Set(state.allItems.map(item => item.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    els.categoryFilter.innerHTML = `<option value="all">All Categories</option>`;

    for (const category of categories) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        els.categoryFilter.appendChild(option);
    }
}

function populateSubcategoryFilter() {
    let sourceItems = state.allItems;

    if (state.category !== "all") {
        sourceItems = sourceItems.filter(item => item.category === state.category);
    }

    const subcategories = [...new Set(sourceItems.map(item => item.subcategory).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    els.subcategoryFilter.innerHTML = `<option value="all">All Subcategories</option>`;

    for (const subcategory of subcategories) {
        const option = document.createElement("option");
        option.value = subcategory;
        option.textContent = capitalizeWords(subcategory);
        els.subcategoryFilter.appendChild(option);
    }

    if (
        state.subcategory !== "all" &&
        !subcategories.includes(state.subcategory)
    ) {
        state.subcategory = "all";
        els.subcategoryFilter.value = "all";
    }
}

function applyFiltersAndRender() {
    let items = [...state.allItems];

    if (state.search) {
        items = items.filter(item => {
            const haystack = [
                item.name,
                item.desc,
                item.category,
                item.subcategory,
                item.notes
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(state.search);
        });
    }

    sortItems(items);

    state.filteredItems = items;

    clampCurrentPage();
    ensureValidSelection();

    renderResultCount();
    renderGrid();
    renderPageIndicator();
    renderDetails();
}

function sortItems(items) {
    switch (state.sort) {
        case "name-desc":
            items.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case "name-asc":
        default:
            items.sort((a, b) => a.name.localeCompare(b.name));
            break;
    }
}

function clampCurrentPage() {
    const totalPages = getTotalPages();
    if (state.currentPage > totalPages) {
        state.currentPage = totalPages;
    }
    if (state.currentPage < 1) {
        state.currentPage = 1;
    }
}

function getTotalPages() {
    return Math.max(1, Math.ceil(state.filteredItems.length / ITEMS_PER_PAGE));
}

function ensureValidSelection() {
    if (state.filteredItems.length === 0) {
        state.selectedItemId = null;
        return;
    }

    const stillExists = state.filteredItems.some(item => item.id === state.selectedItemId);
    if (!stillExists) {
        state.selectedItemId = state.filteredItems[0].id;
    }
}

function renderResultCount() {
    const count = state.filteredItems.length;
    els.resultCount.textContent = `${count} item${count === 1 ? "" : "s"}`;
}

function renderGrid() {
    els.itemGrid.innerHTML = "";

    const startIndex = (state.currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = state.filteredItems.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
        els.itemGrid.innerHTML = `<div class="grid-empty">No items found.</div>`;
        return;
    }

    for (const item of pageItems) {
        const button = document.createElement("button");
        button.className = "item-card";
        if (item.id === state.selectedItemId) {
            button.classList.add("selected");
        }

        button.type = "button";
        button.title = item.name;

        button.innerHTML = `
            ${renderItemImage(item)}
            <span>${escapeHtml(item.name)}</span>
        `;

        button.addEventListener("click", () => {
            state.selectedItemId = item.id;
            renderGrid();
            renderDetails();
        });

        els.itemGrid.appendChild(button);
    }
}

function renderItemImage(item) {
    if (item.img) {
        return `<img src="./data/itemImages/${encodeURIComponent(item.img)}" alt="${escapeHtml(item.name)}" />`;
    }

    return `<div class="item-card-placeholder" aria-hidden="true">?</div>`;
}

function renderPageIndicator() {
    const totalPages = getTotalPages();
    els.pageIndicator.textContent = `Page ${state.currentPage} / ${totalPages}`;
    els.prevPageBtn.disabled = state.currentPage <= 1;
    els.nextPageBtn.disabled = state.currentPage >= totalPages;
}

function renderDetails() {
    const item = state.filteredItems.find(entry => entry.id === state.selectedItemId);

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

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}