import { inventoryActionDialog, chooseInventoryItems } from "../../module/applications/inventory-transfer.mjs";
import { openPurseActions } from "../../module/applications/ground-actions.mjs";

export async function runTransferSelectionTests({ test, assert, equal }) {
    const saved = { game: globalThis.game, canvas: globalThis.canvas, dialog: foundry.applications.api.DialogV2 };
    class Items extends Map { [Symbol.iterator]() { return this.values(); } }
    const entry = (id, type, system = {}) => ({ id, type, name: id, system: { containerId: null, weight: 1, ...system } });
    const items = new Items([
        entry("Sac", "container"), entry("Pochette", "container", { containerId: "Sac" }),
        entry("Gemmes", "object", { containerId: "Pochette", quantity: 4 }),
        entry("Bouclier", "shield", { containerId: "Sac" }), entry("Potions", "object", { quantity: 2 }),
        entry("Queue corporelle", "weapon", { corporeal: true, equipped: true })
    ].map(item => [item.id, item]));
    const source = { uuid: "Actor.sender", type: "character", isOwner: true, items };
    const scene = { id: "scene" }, requests = [];
    const donor = { documentName: "Token", uuid: "Scene.scene.Token.sender", parent: scene, actor: source };
    const target = { documentName: "Token", uuid: "Scene.scene.Token.target", parent: scene, actor: { type: "character", uuid: "Actor.target" } };
    globalThis.game = { user: { isGM: true, targets: new Set([{ document: target }]) },
        users: { activeGM: { async query(_channel, data) { requests.push(data); return { count: 1 }; } } } };
    globalThis.canvas = { ready: true, scene, tokens: { placeables: [{ document: donor }] } };
    let scenario, dialogs = 0;
    async function show(config, prompt) {
        dialogs++;
        const form = document.createElement("form"); form.innerHTML = config.content.innerHTML;
        const footer = document.createElement("footer"); footer.className = "form-footer";
        const configs = [...(config.buttons ?? []), ...(prompt ? [{ action: "ok", ...config.ok }] : [])];
        for (const spec of configs) {
            const button = document.createElement("button"); button.type = spec.type ?? "submit";
            button.dataset.action = spec.action; button.textContent = spec.label; footer.append(button);
        }
        form.append(footer); document.querySelector("main").replaceChildren(form);
        config.render?.(new Event("render"), { element: form });
        const action = await scenario(form, config) ?? (prompt ? "ok" : "transfer");
        const spec = configs.find(button => button.action === action);
        return await spec.callback(new Event("submit"), footer.querySelector('[data-action="' + action + '"]')) ?? spec.action;
    }
    foundry.applications.api.DialogV2 = { prompt: config => show(config, true), wait: config => show(config, false) };
    const field = (form, id) => [...form.querySelectorAll("[data-transfer-item]")].find(control => control.dataset.transferItem === id);
    const reset = () => { requests.length = 0; dialogs = 0; };
    try {
        await test("bulk selectors hide bodily weapons and indent the entire nested row, with selection buttons above the footer", async () => {
            reset(); scenario = form => {
                assert(!field(form, "Queue corporelle"), "Locked weapons must be absent");
                assert(!form.textContent.includes("Queue corporelle"), "A locked item must not leave an empty row");
                const root = field(form, "Sac"), child = field(form, "Pochette"), nested = field(form, "Gemmes");
                equal(child.getBoundingClientRect().left - root.getBoundingClientRect().left, 20);
                equal(nested.getBoundingClientRect().left - root.getBoundingClientRect().left, 40);
                const bar = form.querySelector(".aa-transfer-selection");
                equal([...bar.children].map(button => button.textContent), ["Annuler la sélection", "Tout sélectionner"]);
                assert(bar.previousElementSibling.classList.contains("aa-transfer-choices"), "Buttons must follow the list");
                assert(bar.getBoundingClientRect().bottom <= form.querySelector(".form-footer").getBoundingClientRect().top, "Buttons must precede the footer");
                return "cancel";
            };
            await inventoryActionDialog(source, "transfer"); equal(requests.length, 0);
        });
        await test("selecting a container selects and locks all descendants; deselecting clears and unlocks them", async () => {
            reset(); scenario = form => {
                const bag = field(form, "Sac"), pouch = field(form, "Pochette"), gems = field(form, "Gemmes"), shield = field(form, "Bouclier");
                pouch.click(); equal(gems.value, "4"); assert(gems.disabled, "Nested contents must be locked");
                bag.click();
                equal(pouch.getAttribute("aria-pressed"), "true"); assert(pouch.disabled && gems.disabled && shield.disabled, "All descendants must be locked");
                gems.value = "1"; gems.dispatchEvent(new Event("input")); equal(gems.value, "4");
                bag.click();
                equal(pouch.getAttribute("aria-pressed"), "false"); equal(shield.getAttribute("aria-pressed"), "false"); equal(gems.value, "0");
                assert(!pouch.disabled && !gems.disabled && !shield.disabled, "Deselecting the parent must unlock every child");
                bag.click();
            };
            await inventoryActionDialog(source, "transfer"); equal(requests[0].selections, [{ id: "Sac", quantity: 1 }]);
        });
        await test("clear selection and select all remain independent and preserve the tree locks", async () => {
            reset(); scenario = form => {
                const all = form.querySelector("[data-transfer-select-all]"), none = form.querySelector("[data-transfer-select-none]");
                all.click(); all.click(); equal(field(form, "Sac").getAttribute("aria-pressed"), "true");
                equal(field(form, "Gemmes").value, "4"); assert(field(form, "Gemmes").disabled, "All includes nested contents");
                none.click(); equal(field(form, "Sac").getAttribute("aria-pressed"), "false");
                equal(field(form, "Gemmes").value, "0"); assert(!field(form, "Gemmes").disabled, "Clearing unlocks contents");
                all.click();
            };
            await inventoryActionDialog(source, "transfer");
            equal(requests[0].selections, [{ id: "Sac", quantity: 1 }, { id: "Potions", quantity: 2 }]);
        });
        await test("an unselected outer container permits individual nested selections without duplicate payloads", async () => {
            reset(); scenario = form => {
                field(form, "Pochette").click(); field(form, "Bouclier").click();
                field(form, "Potions").value = "1";
                equal(field(form, "Sac").getAttribute("aria-pressed"), "false");
                assert(!field(form, "Bouclier").disabled, "A sibling stays editable");
            };
            await inventoryActionDialog(source, "transfer");
            equal(requests[0].selections, [{ id: "Pochette", quantity: 1 }, { id: "Bouclier", quantity: 1 }, { id: "Potions", quantity: 1 }]);
        });
        await test("a hidden principal container rebases visible contents to the first indentation level", async () => {
            reset(); scenario = form => {
                assert(!field(form, "Sac"), "Excluded parent must not be listed");
                equal(field(form, "Pochette").closest(".aa-transfer-choice").style.getPropertyValue("--aa-transfer-depth"), "0");
                equal(field(form, "Gemmes").closest(".aa-transfer-choice").style.getPropertyValue("--aa-transfer-depth"), "1");
                field(form, "Pochette").click();
            };
            const choice = await chooseInventoryItems(source, { excludeIds: ["Sac"] });
            equal(choice.selections, [{ id: "Pochette", quantity: 1 }]); equal(requests.length, 0);
        });
        const wallet = entry("Bourse", "purse", { coins: { copper: 24, silver: 19, gold: 0, platinum: 0 } });
        const purseSource = { ...source, items: new Items([[wallet.id, wallet]]) };
        donor.actor = purseSource;
        await test("Luqa operations open their selection directly and transfer the chosen amounts without a second dialog", async () => {
            reset(); scenario = form => {
                equal(form.elements.copper.value, "0");
                assert(form.querySelector('[data-action="transfer"]').disabled, "An empty selection must not be submitted");
                equal([...form.querySelector(".form-footer").children].map(button => button.textContent), ["Annuler", "Transférer", "Déposer"]);
                form.querySelector("[data-transfer-select-all]").click(); equal(form.elements.copper.value, "24"); equal(form.elements.silver.value, "19");
                form.querySelector("[data-transfer-select-none]").click(); equal(form.elements.copper.value, "0"); equal(form.elements.silver.value, "0");
                assert(form.elements.gold.disabled, "Unavailable denominations stay disabled");
                form.elements.copper.value = "3"; form.elements.copper.dispatchEvent(new Event("input"));
                assert(!form.querySelector('[data-action="transfer"]').disabled, "A valid selection enables transfer"); return "transfer";
            };
            await openPurseActions(purseSource, wallet.id);
            equal(dialogs, 1); equal(requests[0].action, "coinPart"); equal(requests[0].coins, { copper: 3, silver: 0, gold: 0, platinum: 0 });
            equal(requests[0].targetToken, target.uuid);
        });
        await test("selecting all Luqa preserves the whole-content transfer behavior", async () => {
            reset(); scenario = form => { form.querySelector("[data-transfer-select-all]").click(); return "transfer"; };
            await openPurseActions(purseSource, wallet.id);
            equal(dialogs, 1); equal(requests[0].action, "coinAll"); equal(requests[0].purseId, wallet.id);
        });
        await test("Luqa can be deposited directly from the same selection dialog", async () => {
            reset(); scenario = form => { form.elements.copper.value = "2"; form.elements.silver.value = "1"; return "drop"; };
            await openPurseActions(purseSource, wallet.id, donor);
            equal(dialogs, 1); equal(requests[0].action, "coinDrop"); equal(requests[0].sourceToken, donor.uuid);
            equal(requests[0].coins, { copper: 2, silver: 1, gold: 0, platinum: 0 });
        });
        await test("cancelling the direct Luqa dialog performs no operation", async () => {
            reset(); scenario = () => "cancel"; await openPurseActions(purseSource, wallet.id);
            equal(dialogs, 1); equal(requests.length, 0);
        });
        await test("empty or excessive direct Luqa selections never send a request", async () => {
            for (const amount of [0, 25]) {
                reset(); scenario = form => { form.elements.copper.value = String(amount); return "transfer"; };
                let rejected = false;
                try { await openPurseActions(purseSource, wallet.id); } catch (error) { rejected = error.message.includes("Luqa"); }
                assert(rejected, "Invalid amounts must be rejected"); equal(requests.length, 0);
            }
        });
        await test("an empty purse still opens its direct selection with movement actions disabled", async () => {
            reset(); wallet.system.coins = {};
            scenario = form => {
                assert(form.querySelector('[data-action="transfer"]').disabled, "Empty transfer must be disabled");
                assert(form.querySelector('[data-action="drop"]').disabled, "Empty deposit must be disabled");
                assert(!form.querySelector('[data-action="cancel"]').disabled, "Cancel stays available");
                return "cancel";
            };
            await openPurseActions(purseSource, wallet.id);
            equal(dialogs, 1); equal(requests.length, 0);
        });
    } finally {
        globalThis.game = saved.game; globalThis.canvas = saved.canvas; foundry.applications.api.DialogV2 = saved.dialog;
    }
}
