# Utopia: Origin — Reference Site

A community-built resource map for [Utopia: Origin](https://play.google.com/store/apps/details?id=com.herogame.gplay.-magicminecraft.mmorpg), a survival MMORPG set in the world of Beia. The goal is to build a comprehensive, interactive map of resource nodes across every island — mines, food sources, creature spawns, chests, and more.

**[→ Open the map](https://gudu0.github.io/Utopia-Reference/map/)**

---

## Using the Map

- **Pan and zoom** using mouse or touch
- **Search** by resource name, island, or notes using the search box in the left sidebar
- **Filter by type** using the checkboxes in the sidebar (minerals, food, creatures, etc.)
- **Filter by island** using the island dropdown
- **Click any node** to see its name, type, island, and coordinates
- The coordinate display in the bottom-right shows your current position in game coordinates as you hover

---

## Contributing Nodes

Node data lives in [`map/map-nodes.json`](map/map-nodes.json). Every entry looks like this:

```json
{
  "id": 1,
  "name": "Iron Mine",
  "type": "mineral",
  "island": "Bone Mountains",
  "notes": "Large cluster near the eastern cliffs",
  "x": 5621,
  "y": 11687
}
```

### Getting coordinates

The easiest way is to use the built-in node editor on the map page:

- **Manual entry** — stand on a resource in-game, read the `X, Y` coordinates shown under your minimap, and enter them in the Manual tab
- **Screenshot scan** — take a screenshot while standing on a resource, drop it into the Scan Screenshots tab, and the coordinates are read automatically. Set the type and island, then copy the resulting JSON from the Output tab. (Tip - go around only doing one resouce, and its much easier to filter the screenshots and settings on the tab.)

### How to submit

If you'd like to contribute nodes you've found, you can:

- **Open a GitHub issue** with your node data (copy the JSON format above)
- **Send me a message on Discord** — gudu0

Pull requests to `map/map-nodes.json` are also welcome if you're comfortable with GitHub.

You can also contribute other things, such as a better map or more category suggestions. Same as above, make an issue or dm me.

### Current resource types

| Type | Description |
|---|---|
| `mineral` | Mines — iron, stone, silver, gold, crystal, etc. |
| `food` | Harvestable food plants — berry bushes, crops, etc. |
| `tree` | Harvestable trees |
| `plant` | Other harvestable plants |
| `creature` | Creature spawn locations |
| `chest` | Hidden and ruins chests |
| `other` | Anything that doesn't fit the above |

---

## Project Status

The map is a work in progress — coverage is incomplete and the map image is temporary. If you spot errors or missing nodes, contributions are very welcome.

The site is planned to eventually expand into a full item reference — crafting recipes, drop sources, and item uses — but the map is the current focus.

## Disclaimer

This is an unofficial fan site. Utopia: Origin and all related assets are property of HK Hero Entertainment. This site is not affiliated with or endorsed by HK Hero Entertainment.