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
const target = { uuid: "Actor.ziggy" };
const token = { uuid: "Scene.scene.Token.pantin", parent: { id: "scene" } };
globalThis.game = { user: { isGM: true, targets: new Set([{ actor: target,
    document: { name: "Ziggy", uuid: "Scene.scene.Token.ziggy", actor: target } }]) },
    users: { activeGM: { async query(_name, data) { requests.push(data); return { count: data.selections.length }; } } } };
globalThis.canvas = { scene: { id: "scene" }, tokens: { placeables: [{ actor: source, document: token }] } };
globalThis.ui = { notifications: { info() {}, error: error => errors.push(error) } };
globalThis.foundry = { utils: { randomID: () => `request${++serial}` }, applications: {
    sheets: { ActorSheetV2: class {} }, api: { HandlebarsApplicationMixin: base => base,
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
const { ArcaneStorageSheet } = await import("../../module/applications/actor/storage-sheet.mjs");
async function test(name, fn) {
    requests.length = errors.length = 0;
    try { await fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
}

for (const action of ["transfer", "drop"]) {
    await test(`${action}: open, edit the rendered quantity and submit`, async () => {
        scenario = form => {
            const check = form.querySelector('[data-transfer-item="object"]');
            check.checked = true;
            const amount = check.closest(".aa-transfer-choice").querySelector("[data-transfer-quantity]");
            equal(amount.value, "4");
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
        all.click(); equal(form.querySelectorAll("[data-transfer-item]:checked").length, 2);
        all.click(); equal(form.querySelectorAll("[data-transfer-item]:checked").length, 0);
        all.click();
    };
    await inventoryActionDialog(source, "transfer");
    equal(errors, []);
    equal(requests[0].selections, [{ id: "object", quantity: 4 }, { id: "bag", quantity: 1 }]);
});

await test("initial item selection survives serialization", async () => {
    scenario = form => equal(form.querySelectorAll("[data-transfer-item]:checked").length, 1);
    await inventoryActionDialog(source, "transfer", "object");
    equal(errors, []);
    equal(requests[0].selections, [{ id: "object", quantity: 4 }]);
});

await test("an empty selection does not send a request", async () => {
    scenario = () => {};
    await inventoryActionDialog(source, "transfer");
    equal(requests.length, 0);
    assert(errors[0]?.includes("Sélectionnez"), "Missing selection validation");
});

await test("an invalid rendered quantity does not send a request", async () => {
    scenario = form => {
        form.querySelector('[data-transfer-item="object"]').checked = true;
        form.querySelector("[data-transfer-quantity]").value = "0";
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
    await ArcaneStorageSheet.DEFAULT_OPTIONS.actions.moveItem.call({ actor: storage }, null, { dataset: { itemId: "child" } });
    equal(moves, [["child", null]]);
});

const { runTokenHUDTests } = await import("./token-bars.mjs");
await runTokenHUDTests({ test, assert, equal });
const { runAptitudeRangeTests } = await import("./aptitude-targeting.mjs");
await runAptitudeRangeTests({ test, assert, equal });
const { runDefenseReductionTests } = await import("./defense-reductions.mjs");
await runDefenseReductionTests({ test, assert, equal });

document.querySelector("pre").textContent = JSON.stringify(results);
document.body.dataset.status = results.every(result => result.passed) ? "passed" : "failed";
