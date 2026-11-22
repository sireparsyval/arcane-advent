import { bindGroundImagePreviews } from "../../module/ground-image-previews.mjs";
import { GROUND_IMAGES } from "../../module/ground-items.mjs";

export async function runGroundImagePreviewTests({ test, assert, equal }) {
    const root = document.createElement("div"), tooltip = document.createElement("div");
    tooltip.className = "aa-ground-preview-tooltip";
    document.body.append(root, tooltip);
    const picture = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="80"><rect width="40" height="80" fill="gold"/></svg>');
    const weapon = { id: "weapon", type: "weapon", name: 'Glaive "<img onerror=alert(1)>"', img: "directory-icon.png", system: { groundTokenImage: picture } };
    const items = new Map([[weapon.id, weapon]]);

    await test("inventory, equipment and storage names expose the ground image without changing editable fields", () => {
        root.innerHTML = '<span data-ground-preview="weapon">Glaive</span><input data-ground-preview="weapon" value="Glaive"><strong data-ground-preview="weapon">Glaive</strong>';
        bindGroundImagePreviews(root, items);
        for (const element of root.children) {
            equal(element.dataset.tooltipClass, "aa-ground-preview-tooltip");
            equal(element.dataset.tooltipDirection, "UP");
            tooltip.innerHTML = element.dataset.tooltipHtml;
            const image = tooltip.querySelector("img");
            equal(image.getAttribute("src"), picture);
            equal(image.alt, `Aperçu au sol — ${weapon.name}`);
            equal(tooltip.querySelectorAll("img").length, 1);
            assert(!image.hasAttribute("onerror"), "An item name must never create an event handler");
            equal(image.getBoundingClientRect().width, 144);
            equal(image.getBoundingClientRect().height, 144);
            equal(getComputedStyle(image).objectFit, "contain");
        }
        const input = root.querySelector("input");
        equal(input.value, "Glaive"); equal(input.readOnly, false); equal(input.disabled, false);
    });

    await test("preview fallbacks match the actual ground art, including bags and coin stacks", () => {
        root.replaceChildren();
        for (const [id, type, system, expected] of [
            ["object", "object", {}, "item-generic.png"], ["shield", "shield", {}, "item-generic.png"],
            ["bag", "container", {}, "bag-item.png"], ["purse", "purse", { coins: {} }, "bag-luqa.png"],
            ["coins", "purse", { coinPile: true, coins: { silver: 3 } }, "stack-luqa-silver.png"]
        ]) {
            items.set(id, { id, type, name: id, img: "directory-icon.png", system });
            const name = document.createElement("span"); name.dataset.groundPreview = id; root.append(name);
            bindGroundImagePreviews(root, items);
            tooltip.innerHTML = name.dataset.tooltipHtml;
            equal(tooltip.querySelector("img").getAttribute("src"), GROUND_IMAGES + expected);
        }
    });

    await test("rerendering refreshes changed artwork and clears previews for removed items", () => {
        root.innerHTML = '<span data-ground-preview="weapon">Glaive</span>';
        const element = root.firstElementChild;
        bindGroundImagePreviews(root, items);
        weapon.system.groundTokenImage = 'assets/new "image".png';
        bindGroundImagePreviews(root, items);
        tooltip.innerHTML = element.dataset.tooltipHtml;
        equal(tooltip.querySelector("img").getAttribute("src"), weapon.system.groundTokenImage);
        const previousTooltip = game.tooltip;
        let closed = false;
        game.tooltip = { element, deactivate() { closed = true; } };
        try {
            items.delete(weapon.id);
            bindGroundImagePreviews(root, items);
            equal(closed, true);
            assert(!element.dataset.tooltipHtml && !element.dataset.tooltipClass && !element.dataset.tooltipDirection, "A removed item left a stale preview");
        } finally { game.tooltip = previousTooltip; }
    });
    root.remove(); tooltip.remove();
}
