const stationListEl = document.getElementById("station-list");
const contentEl = document.getElementById("content");
const contentHeaderEl = document.getElementById("content-header");

let data = { stations: [] };

async function init() {
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    data = await response.json();
    renderStationButtons();
  } catch (error) {
    contentHeaderEl.innerHTML = `
      <h2>Could not load data</h2>
      <p class="muted">Check that data.json exists and is valid JSON.</p>
    `;
    contentEl.innerHTML = "";
    console.error(error);
  }
}

function renderStationButtons() {
  stationListEl.innerHTML = "";

  if (!Array.isArray(data.stations) || data.stations.length === 0) {
    stationListEl.innerHTML = `<p class="muted">No stations yet.</p>`;
    contentHeaderEl.innerHTML = `
      <h2>No data yet</h2>
      <p class="muted">Use the JSON Maker page to add recipes.</p>
    `;
    contentEl.innerHTML = "";
    return;
  }

  data.stations.forEach((station, index) => {
    const button = document.createElement("button");
    button.className = "station-button";
    button.textContent = station.name;

    button.addEventListener("click", () => {
      document
        .querySelectorAll(".station-button")
        .forEach(btn => btn.classList.remove("active"));

      button.classList.add("active");
      renderStation(station.id);
    });

    stationListEl.appendChild(button);

    if (index === 0) {
      button.classList.add("active");
      renderStation(station.id);
    }
  });
}

function renderStation(stationId) {
  const station = data.stations.find(s => s.id === stationId);
  if (!station) return;

  const categoryCount = Array.isArray(station.categories) ? station.categories.length : 0;

  contentHeaderEl.innerHTML = `
    <h2>${escapeHtml(station.name)}</h2>
    <p class="muted">${categoryCount} categor${categoryCount === 1 ? "y" : "ies"}</p>
  `;

  contentEl.innerHTML = "";

  if (!station.categories || station.categories.length === 0) {
    contentEl.innerHTML = `<p class="muted">No categories yet for this station.</p>`;
    return;
  }

  station.categories.forEach(category => {
    const block = document.createElement("section");
    block.className = "category-block";

    let recipeCards = `<p class="muted">No recipes yet.</p>`;

    if (Array.isArray(category.recipes) && category.recipes.length > 0) {
      recipeCards = category.recipes.map(renderRecipeCard).join("");
    }

    block.innerHTML = `
      <h3 class="category-title">${escapeHtml(category.name)}</h3>
      <div class="recipe-list">
        ${recipeCards}
      </div>
    `;

    contentEl.appendChild(block);
  });
}

function renderRecipeCard(recipe) {
  const ingredientsHtml = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map(ingredient => {
        return `<li>${escapeHtml(ingredient.itemName)} x${ingredient.amount}</li>`;
      }).join("")
    : "";

  const notesHtml = recipe.notes
    ? `<p class="recipe-meta">Notes: ${escapeHtml(recipe.notes)}</p>`
    : "";

  return `
    <article class="recipe-card">
      <h4>${escapeHtml(recipe.outputName)} x${recipe.outputAmount ?? 1}</h4>
      <p class="recipe-meta">Ingredients:</p>
      <ul>${ingredientsHtml}</ul>
      ${notesHtml}
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
