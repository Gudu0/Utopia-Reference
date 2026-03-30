# 🛠️ Project Tools

This directory contains utility scripts for data generation and automated image processing.

---

### 🔍 Data Generators & Verifiers
Tools used to create and validate project entries.


| File | Purpose |
| :--- | :--- |
| `jsonGen.html` | Interface for creating new **json entries**. |
| `node-itemCrossVerify.html` | **Data Integrity Tool:** Validates image paths and cross-references IDs (e.g., flags nodes dropping items missing from the database). |
| `imageRenamer.html` | Tool for mass renaming images, use with missing id copy button in the cross verify tool. |

---

### 📸 Automation Actions (`.atn`)
These files automate screenshot cropping for consistent asset creation.

> **How to use:** Drag the `.atn` file into **Photopea**, then navigate to `File` > `Automate` > `Batch`.

*   **`item-inventory.atn`** – Crops items directly from inventory screenshots.
*   **`item-manual.atn`** – Crops items from the in-game manual view.
*   **`node.atn`** – Crops nodes from the in-game manual view.
