const data = {
  stations: [
    {
      id: "handcraft",
      name: "Handcraft",
      categories: [
        {
          id: "basic",
          name: "Basic",
          recipes: [
            {
              id: "stone-pickaxe",
              outputName: "Stone Pickaxe",
              outputAmount: 1,
              ingredients: [
                { itemName: "Stone", amount: 3 },
                { itemName: "Wood", amount: 2 }
              ],
              notes: "Example starter recipe."
            }
          ]
        }
      ]
    },
    {
      id: "campfire",
      name: "Campfire",
      categories: [
        {
          id: "food",
          name: "Food",
          recipes: [
            {
              id: "cooked-meat",
              outputName: "Cooked Meat",
              outputAmount: 1,
              ingredients: [
                { itemName: "Raw Meat", amount: 1 }
              ],
              notes: ""
            }
          ]
        }
      ]
    },
    {
      id: "workbench",
      name: "Work Bench",
      categories: [
        {
          id: "facility",
          name: "Facility",
          recipes: [
            {
              id: "work-bench",
              outputName: "Work Bench",
              outputAmount: 1,
              ingredients: [
                { itemName: "Wood", amount: 20 }
              ],
              notes: "Taken from your screenshot example."
            }
          ]
        }
      ]
    }
  ]
};

const stationListEl = document.getElementById("station-list");
const contentEl = document.getElementById("content");
const contentHeaderEl = document.getElementById("content-header");

function init() {
  renderStationButtons();
}

function renderStationButtons() {
  stationListEl.innerHTML = "";

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

  contentHeaderEl.innerHTML = `
    <h2>${escapeHtml(station.name)}</h2>
    <p class="muted">${station.categories.length} categor${station.categories.length === 1 ? "y" : "ies"}</p>
  `;

  contentEl.innerHTML = "";

  station.categories.forEach(category => {
    const block = document.createElement("section");
    block.className = "category-block";

    const recipeCards = category.recipes.map(renderRecipeCard).join("");

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
  const ingredientsHtml = recipe.ingredients
    .map(ingredient => {
      return `<li>${escapeHtml(ingredient.itemName)} x${ingredient.amount}</li>`;
    })
    .join("");

  const notesHtml = recipe.notes
    ? `<p class="recipe-meta">Notes: ${escapeHtml(recipe.notes)}</p>`
    : "";

  return `
    <article class="recipe-card">
      <h4>${escapeHtml(recipe.outputName)} x${recipe.outputAmount}</h4>
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
