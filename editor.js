const stationSelect = document.getElementById("station-select");
const tabSelect = document.getElementById("tab-select");
const categorySelect = document.getElementById("category-select");

const newStationFields = document.getElementById("new-station-fields");
const newTabFields = document.getElementById("new-tab-fields");
const newCategoryFields = document.getElementById("new-category-fields");

const newStationNameInput = document.getElementById("new-station-name");
const newStationIdInput = document.getElementById("new-station-id");
const newTabNameInput = document.getElementById("new-tab-name");
const newTabIdInput = document.getElementById("new-tab-id");
const newCategoryNameInput = document.getElementById("new-category-name");
const newCategoryIdInput = document.getElementById("new-category-id");

const outputNameInput = document.getElementById("output-name");
const recipeIdInput = document.getElementById("recipe-id");
const outputAmountInput = document.getElementById("output-amount");
const notesInput = document.getElementById("notes");

const ingredientListEl = document.getElementById("ingredient-list");
const jsonOutputEl = document.getElementById("json-output");
const statusBoxEl = document.getElementById("status-box");

const addIngredientBtn = document.getElementById("add-ingredient-btn");
const copyJsonBtn = document.getElementById("copy-json-btn");
const downloadJsonBtn = document.getElementById("download-json-btn");
const resetWorkingDataBtn = document.getElementById("reset-working-data-btn");
const recipeForm = document.getElementById("recipe-form");

let originalData = { stations: [] };
let workingData = { stations: [] };

init();

async function init() {
  wireEvents();
  addIngredientRow();
  await loadDataFile();
}

function wireEvents() {
  stationSelect.addEventListener("change", onStationChange);
  tabSelect.addEventListener("change", onTabChange);
  categorySelect.addEventListener("change", onCategoryChange);
  addIngredientBtn.addEventListener("click", () => addIngredientRow());
  copyJsonBtn.addEventListener("click", copyJson);
  downloadJsonBtn.addEventListener("click", downloadJson);
  resetWorkingDataBtn.addEventListener("click", resetWorkingData);
  recipeForm.addEventListener("submit", onRecipeSubmit);
}

async function loadDataFile() {
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const loaded = await response.json();
    originalData = deepClone(loaded);
    workingData = deepClone(loaded);

    populateStationSelect();
    updateJsonPreview();
    setStatus("Loaded data.json");
  } catch (error) {
    console.error(error);
    originalData = { stations: [] };
    workingData = { stations: [] };
    populateStationSelect();
    updateJsonPreview();
    setStatus("Could not load data.json. A blank working file is being used.");
  }
}

function populateStationSelect(selectedValue = "") {
  const stations = Array.isArray(workingData.stations) ? workingData.stations : [];

  stationSelect.innerHTML = `<option value="">Select station</option>`;

  for (const station of stations) {
    stationSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtmlAttr(station.id)}">${escapeHtmlText(station.name)}</option>`
    );
  }

  stationSelect.insertAdjacentHTML(
    "beforeend",
    `<option value="__new__">+ Create new station</option>`
  );

  if (selectedValue) {
    stationSelect.value = selectedValue;
  } else if (stations.length > 0) {
    stationSelect.value = stations[0].id;
  }

  onStationChange();
}

function populateTabSelect(selectedValue = "") {
  const stationValue = stationSelect.value;

  tabSelect.innerHTML = "";

  if (!stationValue) {
    tabSelect.innerHTML = `<option value="">Select station first</option>`;
    newTabFields.classList.add("hidden");
    populateCategorySelect();
    return;
  }

  if (stationValue === "__new__") {
    tabSelect.innerHTML = `<option value="__new__">Create new tab</option>`;
    tabSelect.value = "__new__";
    newTabFields.classList.remove("hidden");
    populateCategorySelect();
    return;
  }

  const station = workingData.stations.find(s => s.id === stationValue);
  const tabs = station?.tabs ?? [];

  tabSelect.innerHTML = `<option value="">Select tab</option>`;

  for (const tab of tabs) {
    tabSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtmlAttr(tab.id)}">${escapeHtmlText(tab.name)}</option>`
    );
  }

  tabSelect.insertAdjacentHTML(
    "beforeend",
    `<option value="__new__">+ Create new tab</option>`
  );

  if (selectedValue) {
    tabSelect.value = selectedValue;
  } else if (tabs.length > 0) {
    tabSelect.value = tabs[0].id;
  }

  onTabChange();
}

function populateCategorySelect(selectedValue = "") {
  const stationValue = stationSelect.value;
  const tabValue = tabSelect.value;

  categorySelect.innerHTML = "";

  if (!stationValue) {
    categorySelect.innerHTML = `<option value="">Select station first</option>`;
    newCategoryFields.classList.add("hidden");
    return;
  }

  if (!tabValue) {
    categorySelect.innerHTML = `<option value="">Select tab first</option>`;
    newCategoryFields.classList.add("hidden");
    return;
  }

  if (stationValue === "__new__" || tabValue === "__new__") {
    categorySelect.innerHTML = `<option value="__new__">Create new category</option>`;
    categorySelect.value = "__new__";
    newCategoryFields.classList.remove("hidden");
    return;
  }

  const station = workingData.stations.find(s => s.id === stationValue);
  const tab = station?.tabs?.find(t => t.id === tabValue);
  const categories = tab?.categories ?? [];

  categorySelect.innerHTML = `<option value="">Select category</option>`;

  for (const category of categories) {
    categorySelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtmlAttr(category.id)}">${escapeHtmlText(category.name)}</option>`
    );
  }

  categorySelect.insertAdjacentHTML(
    "beforeend",
    `<option value="__new__">+ Create new category</option>`
  );

  if (selectedValue) {
    categorySelect.value = selectedValue;
  } else if (categories.length > 0) {
    categorySelect.value = categories[0].id;
  }

  onCategoryChange();
}

function onStationChange() {
  const isNewStation = stationSelect.value === "__new__";
  newStationFields.classList.toggle("hidden", !isNewStation);
  populateTabSelect();
}

function onTabChange() {
  const isNewTab = tabSelect.value === "__new__";
  newTabFields.classList.toggle("hidden", !isNewTab);
  populateCategorySelect();
}

function onCategoryChange() {
  const isNewCategory = categorySelect.value === "__new__";
  newCategoryFields.classList.toggle("hidden", !isNewCategory);
}

function addIngredientRow(itemName = "", amount = 1) {
  const row = document.createElement("div");
  row.className = "ingredient-row";

  row.innerHTML = `
    <div class="field">
      <label>Ingredient Name</label>
      <input type="text" class="ingredient-name" placeholder="wood" value="${escapeHtmlAttr(itemName)}" />
    </div>

    <div class="field">
      <label>Amount</label>
      <input type="number" class="ingredient-amount" min="1" value="${Number(amount) || 1}" />
    </div>

    <button type="button" class="btn danger remove-ingredient-btn">Remove</button>
  `;

  row.querySelector(".remove-ingredient-btn").addEventListener("click", () => {
    row.remove();
    if (ingredientListEl.children.length === 0) {
      addIngredientRow();
    }
  });

  ingredientListEl.appendChild(row);
}

function onRecipeSubmit(event) {
  event.preventDefault();

  try {
    const entry = collectFormData();
    addRecipeToWorkingData(entry);
    updateJsonPreview();

    populateStationSelect(entry.stationId);
    populateTabSelect(entry.tabId);
    populateCategorySelect(entry.categoryId);
    clearRecipeFields();

    setStatus(`Added recipe: ${entry.recipe.outputName}`);
  } catch (error) {
    setStatus(error.message);
  }
}

function collectFormData() {
  let stationId = "";
  let stationName = "";

  if (stationSelect.value === "__new__") {
    stationName = clean(newStationNameInput.value);
    stationId = clean(newStationIdInput.value) || slugify(stationName);

    if (!stationName) {
      throw new Error("New station name is required.");
    }
  } else {
    const station = workingData.stations.find(s => s.id === stationSelect.value);
    if (!station) {
      throw new Error("Pick a station.");
    }
    stationId = station.id;
    stationName = station.name;
  }

  let tabId = "";
  let tabName = "";

  if (tabSelect.value === "__new__") {
    tabName = clean(newTabNameInput.value);
    tabId = clean(newTabIdInput.value) || slugify(tabName);

    if (!tabName) {
      throw new Error("New tab name is required.");
    }
  } else {
    const station = workingData.stations.find(s => s.id === stationId);
    const tab = station?.tabs?.find(t => t.id === tabSelect.value);

    if (!tab) {
      throw new Error("Pick a tab.");
    }

    tabId = tab.id;
    tabName = tab.name;
  }

  let categoryId = "";
  let categoryName = "";

  if (categorySelect.value === "__new__") {
    categoryName = clean(newCategoryNameInput.value);
    categoryId = clean(newCategoryIdInput.value) || slugify(categoryName);

    if (!categoryName) {
      throw new Error("New category name is required.");
    }
  } else {
    const station = workingData.stations.find(s => s.id === stationId);
    const tab = station?.tabs?.find(t => t.id === tabId);
    const category = tab?.categories?.find(c => c.id === categorySelect.value);

    if (!category) {
      throw new Error("Pick a category.");
    }

    categoryId = category.id;
    categoryName = category.name;
  }

  const outputName = clean(outputNameInput.value);
  if (!outputName) {
    throw new Error("Output name is required.");
  }

  const recipeId = clean(recipeIdInput.value) || slugify(outputName);
  const outputAmount = Number(outputAmountInput.value);

  if (!Number.isFinite(outputAmount) || outputAmount < 1) {
    throw new Error("Output amount must be 1 or higher.");
  }

  const ingredients = collectIngredients();
  if (ingredients.length === 0) {
    throw new Error("Add at least one ingredient.");
  }

  const notes = clean(notesInput.value);

  return {
    stationId,
    stationName,
    tabId,
    tabName,
    categoryId,
    categoryName,
    recipe: {
      id: recipeId,
      outputName,
      outputAmount,
      ingredients,
      notes
    }
  };
}

function collectIngredients() {
  const rows = [...ingredientListEl.querySelectorAll(".ingredient-row")];
  const ingredients = [];

  for (const row of rows) {
    const itemName = clean(row.querySelector(".ingredient-name").value);
    const amount = Number(row.querySelector(".ingredient-amount").value);

    if (!itemName) {
      continue;
    }

    if (!Number.isFinite(amount) || amount < 1) {
      throw new Error(`Ingredient "${itemName}" has an invalid amount.`);
    }

    ingredients.push({ itemName, amount });
  }

  return ingredients;
}

function addRecipeToWorkingData(entry) {
  if (!Array.isArray(workingData.stations)) {
    workingData.stations = [];
  }

  let station = workingData.stations.find(s => s.id === entry.stationId);

  if (!station) {
    station = {
      id: entry.stationId,
      name: entry.stationName,
      tabs: []
    };
    workingData.stations.push(station);
  }

  if (!Array.isArray(station.tabs)) {
    station.tabs = [];
  }

  let tab = station.tabs.find(t => t.id === entry.tabId);

  if (!tab) {
    tab = {
      id: entry.tabId,
      name: entry.tabName,
      categories: []
    };
    station.tabs.push(tab);
  }

  if (!Array.isArray(tab.categories)) {
    tab.categories = [];
  }

  let category = tab.categories.find(c => c.id === entry.categoryId);

  if (!category) {
    category = {
      id: entry.categoryId,
      name: entry.categoryName,
      recipes: []
    };
    tab.categories.push(category);
  }

  if (!Array.isArray(category.recipes)) {
    category.recipes = [];
  }

  const existingIndex = category.recipes.findIndex(r => r.id === entry.recipe.id);

  if (existingIndex >= 0) {
    const shouldReplace = confirm(
      `Recipe ID "${entry.recipe.id}" already exists in this category. Replace it?`
    );

    if (!shouldReplace) {
      throw new Error("Recipe not added.");
    }

    category.recipes[existingIndex] = entry.recipe;
  } else {
    category.recipes.push(entry.recipe);
  }
}

function clearRecipeFields() {
  outputNameInput.value = "";
  recipeIdInput.value = "";
  outputAmountInput.value = "1";
  notesInput.value = "";

  ingredientListEl.innerHTML = "";
  addIngredientRow();
}

function updateJsonPreview() {
  jsonOutputEl.value = JSON.stringify(workingData, null, 2);
}

function resetWorkingData() {
  workingData = deepClone(originalData);
  populateStationSelect();
  updateJsonPreview();
  clearRecipeFields();
  setStatus("Working data reset to the loaded data.json");
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(jsonOutputEl.value);
    setStatus("Copied JSON to clipboard.");
  } catch (error) {
    console.error(error);
    setStatus("Could not copy JSON.");
  }
}

function downloadJson() {
  const blob = new Blob([jsonOutputEl.value], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  setStatus("Downloaded data.json");
}

function setStatus(message) {
  statusBoxEl.textContent = message;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return String(value ?? "").trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function escapeHtmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
