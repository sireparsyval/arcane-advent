import { groundItemAppearance } from "./ground-items.mjs";
import { isInventoryItem } from "./inventory.mjs";

// Use Foundry's native hover tooltip, including in detached sheet windows.
// DOM serialization safely escapes item names and image paths.
export function bindGroundImagePreviews(root, items) {
    for (const element of root.querySelectorAll("[data-ground-preview]")) {
        if (globalThis.game?.tooltip?.element === element) game.tooltip.deactivate();
        delete element.dataset.tooltipHtml;
        delete element.dataset.tooltipClass;
        delete element.dataset.tooltipDirection;
        const item = items.get(element.dataset.groundPreview);
        if (!isInventoryItem(item)) continue;
        const image = root.ownerDocument.createElement("img");
        image.src = groundItemAppearance(item).img;
        image.alt = `Aperçu au sol — ${item.name}`;
        image.width = image.height = 144;
        image.loading = "lazy";
        element.dataset.tooltipHtml = image.outerHTML;
        element.dataset.tooltipClass = "aa-ground-preview-tooltip";
        element.dataset.tooltipDirection = "UP";
    }
}
