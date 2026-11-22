// Real DOM regression tests for DialogV2's documented serialization contract.
// https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html
const results = [];
const requests = [], errors = [];
let scenario, serial = 0;
const assert = (value, message) => { if (!value) throw new Error(message); };
const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
class Items extends Map { [Symbol.iterator]() { return this.values(); } }
const source = { uuid: "Actor.pantin", type: "character", isOwner: true,
    items: new Items([
        ["object", { id: "object", name: "Objet <test>", type: "object", system: { quantity: 4 } }],
        ["bag", { id: "bag", name: "Sac", type: "container", system: {} }]
    ]) };
const target = { uuid: "Actor.ziggy", type: "character" };
const token = { documentName: "Token", uuid: "Scene.scene.Token.pantin", parent: { id: "scene" }, actor: source };
globalThis.game = { user: { isGM: true, targets: new Set([{ actor: target,
    document: { documentName: "Token", parent: { id: "scene" }, name: "Ziggy", uuid: "Scene.scene.Token.ziggy", actor: target } }]) },
    users: { activeGM: { async query(_name, data) { requests.push(data); return { count: data.selections.length }; } } } };
globalThis.canvas = { scene: { id: "scene" }, tokens: { placeables: [{ actor: source, document: token }] } };
globalThis.ui = { notifications: { info() {}, error: error => errors.push(error) } };
globalThis.foundry = { utils: { randomID: () => `request${++serial}` }, applications: {
    sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} }, api: { HandlebarsApplicationMixin: base => base,
        DialogV2: { async prompt(config) {
            assert(config.content instanceof HTMLDivElement, "config.content must be a div");
            assert(config.content.attributes.length === 0, "config.content element must have no attributes");
            const form = document.createElement("form");
            // Foundry stringifies the content. Original event handlers and live
            // input properties must not be used as the user's rendered fields.
            form.innerHTML = config.content.innerHTML;
            const button = document.createElement("button");
            form.append(button);
            document.querySelector("main").replaceChildren(form);
            config.render?.(new Event("render"), { element: form });
            if (await scenario(form, config) === "cancel") return config.buttons[0].callback();
            return config.ok.callback(new Event("submit"), button);
        } }
    }
} };
const { inventoryActionDialog } = await import("../../module/applications/inventory-transfer.mjs");
const { chooseLuqa, performGroundAction } = await import("../../module/applications/ground-actions.mjs");
const { ArcaneStorageSheet } = await import("../../module/applications/actor/storage-sheet.mjs");
async function test(name, fn) {
    requests.length = errors.length = 0;
    try { await fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
}

for (const action of ["transfer", "drop"]) {
    await test(`${action}: open, edit the rendered quantity and submit`, async () => {
        scenario = form => {
            const amount = form.querySelector('[data-transfer-item="object"]');
            equal(amount.value, "0");
            amount.value = "2";
            assert(form.textContent.includes("Objet <test>"), "Names must remain text");
            assert(!form.querySelector("test"), "Item name was interpreted as markup");
        };
        await inventoryActionDialog(source, action);
        equal(errors, []);
        equal(requests.length, 1);
        equal(requests[0].selections, [{ id: "object", quantity: 2 }]);
        equal(requests[0].action, action);
        equal(action === "transfer" ? requests[0].targetToken : requests[0].sourceToken,
            action === "transfer" ? "Scene.scene.Token.ziggy" : token.uuid);
    });
}

await test("select all and deselect all work after rendering", async () => {
    scenario = form => {
        const all = form.querySelector("[data-transfer-select-all]");
        all.click(); equal(form.querySelector('[data-transfer-item="object"]').value, "4");
        equal(form.querySelector('[data-transfer-item="bag"]').getAttribute("aria-pressed"), "true");
        all.click(); equal(form.querySelector('[data-transfer-item="object"]').value, "4");
        form.querySelector("[data-transfer-select-none]").click(); equal(form.querySelector('[data-transfer-item="object"]').value, "0");
        equal(form.querySelector('[data-transfer-item="bag"]').getAttribute("aria-pressed"), "false");
        all.click();
    };
    await inventoryActionDialog(source, "transfer");
    equal(errors, []);
    equal(requests[0].selections, [{ id: "object", quantity: 4 }, { id: "bag", quantity: 1 }]);
});

await test("every bulk selection opens at zero with toggles off, even with an old preselection hint", async () => {
    for (const hint of ["object", "bag"]) {
        scenario = form => {
            equal(form.querySelector('[data-transfer-item="object"]').value, "0");
            equal(form.querySelector('[data-transfer-item="bag"]').getAttribute("aria-pressed"), "false");
            assert([...form.querySelectorAll('.aa-transfer-weight')].every(weight => weight.textContent === "0 kg"), "Initial transfer weights must be zero");
            return "cancel";
        };
        await inventoryActionDialog(source, "transfer", hint);
        equal(errors, []); equal(requests.length, 0);
    }
});

await test("a unique object uses a serialized yes/no toggle in the same slot as stack amounts", async () => {
    const single = { ...source, items: new Items([["single", { id: "single", name: "Unique", type: "object", system: { quantity: 1, weight: 2 } }]]) };
    scenario = form => {
        const toggle = form.querySelector('[data-transfer-item="single"]');
        equal(toggle.tagName, "BUTTON"); equal(toggle.textContent, "❌"); equal(toggle.type, "button");
        assert(!form.querySelector('[data-transfer-quantity], input[type="checkbox"]'), "A unique item must have just its toggle");
        toggle.click(); equal(toggle.getAttribute("aria-pressed"), "true"); equal(toggle.textContent, "✔️");
        toggle.click(); equal(toggle.getAttribute("aria-pressed"), "false");
        toggle.click();
        equal(form.querySelector('.aa-transfer-weight').textContent, "2 kg");
    };
    await inventoryActionDialog(single, "transfer");
    equal(errors, []); equal(requests[0].selections, [{ id: "single", quantity: 1 }]);
});

await test("stack quantities are selected directly without a checkbox and show their available stock", async () => {
    scenario = form => {
        const amount = form.querySelector('[data-transfer-item="object"]');
        equal(amount.closest('.aa-transfer-amount').querySelector('.aa-transfer-available').textContent, "/ 4");
        const toggle = form.querySelector('[data-transfer-item="bag"]');
        equal(amount.getBoundingClientRect().width, 64); equal(toggle.getBoundingClientRect().width, 64);
        assert(amount.closest('.aa-transfer-amount').querySelector('.aa-transfer-available').getBoundingClientRect().left >= amount.getBoundingClientRect().right, "The available stock must follow the amount field");
        assert(!form.querySelector('input[type="checkbox"]'), "Stacks must not require a separate checkbox");
        amount.value = "3"; amount.dispatchEvent(new Event("input"));
    };
    await inventoryActionDialog(source, "transfer");
    equal(errors, []); equal(requests[0].selections, [{ id: "object", quantity: 3 }]);
});

await test("currency amounts and available balances survive serialization; zero means no transfer", async () => {
    scenario = form => {
        assert(!form.querySelector('input[type="checkbox"]'), "Currency must use amounts only");
        equal(form.elements.copper.value, "0"); equal(form.elements.silver.value, "0");
        assert([...form.querySelectorAll('.aa-transfer-weight')].every(weight => weight.textContent === "0 kg"), "Initial currency weights must be zero");
        equal(form.elements.copper.closest('.aa-transfer-amount').querySelector('.aa-transfer-available').textContent, "/ 24");
        form.elements.copper.value = "5"; form.elements.copper.dispatchEvent(new Event("input"));
        equal(form.elements.copper.closest('.aa-transfer-choice').querySelector('.aa-transfer-weight').textContent, "0,05 kg");
        form.elements.silver.value = "0";
        equal(form.elements.gold.disabled, true);
    };
    equal(await chooseLuqa({ system: { coins: { copper: 24, silver: 1 } } }, "Luqa"), { copper: 5, silver: 0, gold: 0, platinum: 0 });
});

await test("splitting shows the original stack balance but keeps at least one copy in the source", async () => {
    const pile = { ...source, type: "storage", system: { ground: true }, getFlag: () => false,
        items: new Items([["stack", { id: "stack", name: "Pile", type: "object", system: { quantity: 5 } }]]) };
    scenario = form => {
        equal(form.elements.quantity.value, "2"); equal(form.elements.quantity.max, "4");
        equal(form.querySelector('.aa-transfer-available').textContent, "/ 5");
        form.elements.quantity.value = "4";
    };
    await performGroundAction(pile, "split", { token });
    equal(errors, []); equal(requests[0].action, "split"); equal(requests[0].selections, [{ id: "stack", quantity: 4 }]);
});

await test("an empty selection does not send a request", async () => {
    scenario = () => {};
    await inventoryActionDialog(source, "transfer");
    equal(requests.length, 0);
    assert(errors[0]?.includes("Sélectionnez"), "Missing selection validation");
});

await test("an invalid rendered quantity does not send a request", async () => {
    scenario = form => {
        form.querySelector("[data-transfer-quantity]").value = "5";
    };
    await inventoryActionDialog(source, "transfer");
    equal(requests.length, 0);
    assert(errors[0]?.includes("Quantité invalide"), "Missing quantity validation");
});

await test("cancelling does not transfer objects", async () => {
    scenario = () => "cancel";
    await inventoryActionDialog(source, "drop");
    equal(requests.length, 0); equal(errors, []);
});

await test("ground pickup reads the rendered cleanup option without selecting extra items", async () => {
    const ground = { ...source, type: "storage", system: { ground: true }, getFlag: () => false };
    scenario = form => {
        const cleanup = form.querySelector("[data-delete-empty-ground]");
        assert(cleanup, "Ground transfer must offer empty-deposit cleanup");
        equal(cleanup.checked, false);
        cleanup.checked = true;
        form.querySelector("[data-transfer-select-all]").click();
    };
    await inventoryActionDialog(ground, "transfer");
    equal(errors, []);
    equal(requests[0].deleteEmptyGround, true);
    equal(requests[0].selections.length, 2);
});

await test("ground cleanup is opt-in and permanent storage does not offer it", async () => {
    for (const ground of [true, false]) {
        const storage = { ...source, type: "storage", system: { ground }, getFlag: () => false };
        scenario = form => {
            equal(Boolean(form.querySelector("[data-delete-empty-ground]")), ground);
            form.querySelector('[data-transfer-item="object"]').value = "1";
        };
        await inventoryActionDialog(storage, "transfer");
        equal(errors, []);
        equal(requests.at(-1).deleteEmptyGround, false);
    }
});

await test("storage move reads the rendered destination", async () => {
    const parent = { id: "parent", type: "container", name: "Sac", system: { containerId: null } };
    const child = { id: "child", type: "object", system: { containerId: "parent" } };
    const moves = [];
    const storage = { items: new Items([[parent.id, parent], [child.id, child]]),
        async moveInventoryItem(...args) { moves.push(args); } };
    scenario = form => {
        equal(form.elements.destination.value, "parent");
        form.elements.destination.value = "";
    };
    await ArcaneStorageSheet.DEFAULT_OPTIONS.actions.moveItem.call({ inventoryHost: storage }, null, { dataset: { itemId: "child" } });
    equal(moves, [["child", null]]);
});

const { runTokenHUDTests } = await import("./token-bars.mjs");
await runTokenHUDTests({ test, assert, equal });
const { runAptitudeRangeTests } = await import("./aptitude-targeting.mjs");
await runAptitudeRangeTests({ test, assert, equal });
const { runDefenseReductionTests } = await import("./defense-reductions.mjs");
await runDefenseReductionTests({ test, assert, equal });
const { runCharacterEffectsTests } = await import("./character-effects.mjs");
await runCharacterEffectsTests({ test, assert, equal });
const { runGroundImagePreviewTests } = await import("./ground-image-previews.mjs");
await runGroundImagePreviewTests({ test, assert, equal });

const { runGroundAnimationHUDTests } = await import("./ground-animation-hud.mjs");
await runGroundAnimationHUDTests({ test, assert, equal });

const { runTransferSelectionTests } = await import("./transfer-selection.mjs");
await runTransferSelectionTests({ test, assert, equal });

document.querySelector("pre").textContent = JSON.stringify(results);
document.body.dataset.status = results.every(result => result.passed) ? "passed" : "failed";
