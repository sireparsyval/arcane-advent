import test from "node:test";
import assert from "node:assert/strict";
import { looseGroundItem } from "../module/storage.mjs";
import { targetedInventoryRecipient, chooseInventoryRecipient, transferLooseGroundItem, quickInventoryAction, runQuickInventoryAction } from "../module/applications/ground-item-transfer.mjs";
import { performGroundAction, chooseLuqa } from "../module/applications/ground-actions.mjs";

class Surface {
    events = new Map();
    addEventListener(name, callback) { this.events.set(name, callback); }
    removeEventListener(name, callback) { if (this.events.get(name) === callback) this.events.delete(name); }
    emit(name, values = {}) {
        this.events.get(name)?.({ button: 0, clientX: 250, clientY: 50,
            preventDefault() {}, stopImmediatePropagation() {}, ...values });
    }
}
class Items extends Map { [Symbol.iterator]() { return this.values(); } }

test("currency actions accept a targeted ground purse from either a carried or a deposited purse", async () => {
    for (const carried of [true, false]) {
        const env = environment();
        env.source.type = carried ? "character" : "storage"; env.source.isOwner = true;
        Object.assign(env.source.items.get("apple"), { type: "purse", system: { coins: { copper: 4 } } });
        env.target.actor = { type: "storage", uuid: "Item.target", system: { ground: true }, getFlag: () => false,
            items: new Items([["purse", { id: "purse", type: "purse", system: { coins: {} } }]]) };
        await performGroundAction(env.source, "coinsAll", { itemId: "apple" });
        assert.equal(env.requests.length, 1);
        assert.equal(env.requests[0].action, "coinAll");
        assert.equal(env.requests[0].purseId, "apple");
        assert.equal(env.requests[0].targetToken, env.target.uuid);
        assert.equal(env.prompts(), 0);
        assert.throws(() => targetedInventoryRecipient(env.source), /contenant ou un stockage/);
    }
});

test("currency selection defaults to all available denominations and reads the submitted selection", async () => {
    environment();
    const purse = { system: { coins: { copper: 7, gold: 2 } } };
    foundry.applications.api.DialogV2.prompt = async config => {
        const rows = config.content.children[0].children;
        assert.deepEqual(rows.map(row => row.children[2].defaultValue), ["7", "0", "2", "0"]);
        assert.deepEqual(rows.map(row => row.children[0].defaultChecked), [true, false, true, false]);
        return config.ok.callback(null, { form: { elements: Object.fromEntries(["copper", "silver", "gold", "platinum"].flatMap(key => [
            [`take.${key}`, { checked: key === "copper" }], [key, { valueAsNumber: key === "copper" ? 3 : 0 }]
        ])) } });
    };
    assert.deepEqual(await chooseLuqa(purse, "Luqa"), { copper: 3, silver: 0, gold: 0, platinum: 0 });
});

test("invalid or cancelled currency selections never send a transfer", async () => {
    for (const value of [0, 5, 1.5, NaN, null]) {
        const env = environment();
        Object.assign(env.source.items.get("apple"), { type: "purse", system: { coins: { copper: 4 } } });
        foundry.applications.api.DialogV2.prompt = async config => value === null ? config.buttons[0].callback()
            : config.ok.callback(null, { form: { elements: Object.fromEntries(["copper", "silver", "gold", "platinum"].flatMap(key => [
                [`take.${key}`, { checked: key === "copper" }], [key, { valueAsNumber: value }]
            ])) } });
        const operation = performGroundAction(env.source, "coinsPart", { itemId: "apple" });
        if (value === null) assert.equal(await operation, undefined);
        else await assert.rejects(operation, /Luqa/);
        assert.equal(env.requests.length, 0);
    }
});
function environment(quantity = 1) {
    const view = new Surface(), keyboard = new Surface(), hooks = new Map(), requests = [], warnings = [];
    let serial = 0, prompts = 0;
    const item = { id: "apple", name: "Pomme <test>", type: "object", system: { quantity } };
    const source = { uuid: "Item.ground", type: "storage", system: { ground: true }, getFlag: () => false,
        items: new Items([[item.id, item]]) };
    const scene = { id: "scene", grid: { size: 100 } };
    const target = { documentName: "Token", id: "recipient", uuid: "Scene.scene.Token.recipient", parent: scene,
        x: 200, y: 0, width: 1, height: 1, actor: { uuid: "Actor.recipient", type: "character" } };
    const selected = { documentName: "Token", uuid: "Scene.scene.Token.selected", parent: scene,
        x: 0, y: 0, width: 1, height: 1, actor: { uuid: "Actor.selected", type: "character" } };
    globalThis.canvas = { ready: true, scene, app: { view }, level: { id: "ground" },
        tokens: { controlled: [{ document: selected }], placeables: [{ document: selected, controlled: true }, { document: target }] },
        canvasCoordinatesFromClient: point => point };
    globalThis.game = { user: { isGM: true, targets: new Set([{ document: target }]) },
        users: { activeGM: { async query(_name, data) { requests.push(data); return { count: 1 }; } } } };
    globalThis.ui = { notifications: { info() {}, warn: message => warnings.push(message) } };
    globalThis.Hooks = { on(name, callback) { const id = ++serial; hooks.set(id, { name, callback }); return id; },
        off(_name, id) { hooks.delete(id); } };
    globalThis.document = Object.assign(keyboard, { createElement: tag => ({ tag, children: [], append(...children) { this.children.push(...children); } }) });
    const dialog = { value: null, cancel: false, maximum: null, name: null };
    globalThis.foundry = { utils: { randomID: () => `id${++serial}` }, applications: { api: { DialogV2: { async prompt(config) {
        prompts++;
        assert.equal(config.position.width, 320);
        const input = config.content.children[0].children[0];
        dialog.maximum = input.defaultValue;
        dialog.name = config.window.title;
        if (dialog.cancel) return config.buttons[0].callback();
        // The callback must read the submitted field, not the original input.
        return config.ok.callback(null, { form: { elements: { quantity: { valueAsNumber: dialog.value ?? Number(input.defaultValue) } } } });
    } } } } };
    return { source, target, selected, requests, warnings, hooks, view, keyboard, dialog, prompts: () => prompts };
}

test("only a single loose ground object, equipment or purse uses the simple menu", () => {
    const { source } = environment();
    const entry = source.items.get("apple");
    for (const type of ["object", "weapon", "shield", "protection", "accessory", "purse"]) {
        entry.type = type; assert.equal(looseGroundItem(source), entry);
    }
    entry.type = "container"; assert.equal(looseGroundItem(source), null);
    entry.type = "object"; source.system.ground = false; assert.equal(looseGroundItem(source), null);
    source.system.ground = true; source.items.set("other", { ...entry, id: "other" }); assert.equal(looseGroundItem(source), null);
});

test("a single item transfers straight to the explicit target without a prompt or using the controlled token", async () => {
    const env = environment();
    await transferLooseGroundItem(env.source);
    assert.equal(env.prompts(), 0);
    assert.equal(env.requests.length, 1);
    assert.equal(env.requests[0].targetToken, env.target.uuid);
    assert.equal(env.requests[0].deleteEmptyGround, true);
    assert.deepEqual(env.requests[0].selections, [{ id: "apple", quantity: 1 }]);
    assert.equal(env.view.events.size, 0);
});

test("controlling an actor without a target waits for a left click on the recipient", async () => {
    const env = environment(); game.user.targets.clear();
    const transfer = transferLooseGroundItem(env.source);
    assert.equal(env.requests.length, 0);
    assert.equal(env.view.events.size, 1);
    env.view.emit("pointerdown");
    await transfer;
    assert.equal(env.requests[0].targetToken, env.target.uuid);
    assert.notEqual(env.requests[0].targetToken, env.selected.uuid);
    assert.equal(env.hooks.size, 0); assert.equal(env.keyboard.events.size, 0);
});

test("a stack prompts for its maximum by default and reads the chosen quantity", async () => {
    for (const chosen of [null, 2]) {
        const env = environment(5); env.dialog.value = chosen;
        await transferLooseGroundItem(env.source);
        assert.equal(env.prompts(), 1);
        assert.equal(env.dialog.maximum, "5"); assert.equal(env.dialog.name, "Pomme <test>");
        assert.equal(env.requests[0].selections[0].quantity, chosen ?? 5);
    }
});

test("cancelling or submitting an invalid quantity never sends a transfer", async () => {
    const cancelled = environment(5); cancelled.dialog.cancel = true;
    assert.equal(await transferLooseGroundItem(cancelled.source), null);
    assert.equal(cancelled.requests.length, 0);
    for (const value of [0, 6, 1.5, NaN]) {
        const env = environment(5); env.dialog.value = value;
        await assert.rejects(transferLooseGroundItem(env.source), /Quantité invalide/);
        assert.equal(env.requests.length, 0);
    }
});

test("a targetless stack asks its quantity then waits for the recipient click", async () => {
    const env = environment(4); env.dialog.value = 2; game.user.targets.clear();
    const transfer = transferLooseGroundItem(env.source);
    await Promise.resolve();
    assert.equal(env.requests.length, 0);
    env.view.emit("pointerdown");
    await transfer;
    assert.equal(env.requests[0].selections[0].quantity, 2);
});

test("multiple targets, the source itself and a locked storage are rejected without falling back to selection", async () => {
    const env = environment();
    game.user.targets.add({ document: env.selected });
    assert.throws(() => targetedInventoryRecipient(env.source), /un seul/);
    game.user.targets = new Set([{ document: { ...env.target, actor: env.source } }]);
    assert.throws(() => targetedInventoryRecipient(env.source), /autre inventaire/);
    game.user.isGM = false;
    game.user.targets = new Set([{ document: { ...env.target, actor: { type: "storage", uuid: "Actor.locked",
        system: { locked: true }, getFlag: () => false } } }]);
    assert.throws(() => targetedInventoryRecipient(env.source), /verrouillé/);
    assert.equal(env.requests.length, 0);
});

test("Escape, right click, scene teardown and sheet closure cancel and release every picker listener", async () => {
    for (const method of ["escape", "right", "scene", "close"]) {
        const env = environment(), controller = new AbortController();
        const choice = chooseInventoryRecipient(env.source, { signal: controller.signal });
        if (method === "escape") env.keyboard.emit("keydown", { key: "Escape" });
        else if (method === "right") env.view.emit("pointerdown", { button: 2 });
        else if (method === "close") controller.abort();
        else for (const hook of [...env.hooks.values()]) hook.callback();
        assert.equal(await choice, null);
        assert.equal(env.view.events.size, 0); assert.equal(env.keyboard.events.size, 0); assert.equal(env.hooks.size, 0);
        assert.equal(env.requests.length, 0);
    }
});

test("an invalid click keeps the picker open, and invisible tokens or tokens on another floor are skipped", async () => {
    const env = environment();
    const choice = chooseInventoryRecipient(env.source);
    env.view.emit("pointerdown", { clientX: 800 });
    assert.equal(env.warnings.length, 1); assert.equal(env.view.events.size, 1);
    canvas.tokens.placeables.push({ document: { ...env.selected, levels: new Set(["upstairs"]) }, bounds: { contains: () => true } });
    canvas.tokens.placeables.push({ document: env.selected, visible: false, bounds: { contains: () => true } });
    env.view.emit("pointerdown");
    assert.equal(await choice, env.target);
});

test("a character's per-item transfer only sends that object and uses the same targetless picker", async () => {
    const env = environment();
    env.source.type = "character"; env.source.isOwner = true;
    env.source.items.set("other", { id: "other", type: "object", system: { quantity: 8 } });
    game.user.targets.clear();
    const transfer = quickInventoryAction(env.source, "apple", "transfer");
    assert.equal(env.requests.length, 0);
    env.view.emit("pointerdown"); await transfer;
    assert.deepEqual(env.requests[0].selections, [{ id: "apple", quantity: 1 }]);
    assert.equal(env.requests[0].targetToken, env.target.uuid);
});

test("single equipment, purses and containers transfer without the bulk item-selection menu", async () => {
    for (const type of ["weapon", "shield", "protection", "accessory", "purse", "container"]) {
        const env = environment(); env.source.items.get("apple").type = type;
        await quickInventoryAction(env.source, "apple", "transfer");
        assert.equal(env.prompts(), 0);
        assert.deepEqual(env.requests[0].selections, [{ id: "apple", quantity: 1 }]);
    }
});

test("per-item ground drops ask only the stack quantity and resolve the source token independently of targets", async () => {
    const env = environment(5); env.dialog.value = 2;
    env.source.type = "character"; env.source.isOwner = true;
    canvas.tokens.placeables.unshift({ document: { ...env.selected, actor: env.source }, controlled: true });
    game.user.targets.add({ document: env.selected });
    await quickInventoryAction(env.source, "apple", "drop");
    assert.equal(env.prompts(), 1);
    assert.equal(env.requests[0].sourceToken, env.selected.uuid);
    assert.equal(env.requests[0].targetToken, undefined);
    assert.equal(env.requests[0].action, "drop");
    assert.deepEqual(env.requests[0].selections, [{ id: "apple", quantity: 2 }]);
    assert.equal(env.view.events.size, 0);
});

test("per-item actions reject a missing source token, inaccessible inventory and corporeal weapons", async () => {
    const env = environment();
    await assert.rejects(quickInventoryAction(env.source, "apple", "drop"), /Placez/);
    env.source.type = "character"; env.source.isOwner = false;
    await assert.rejects(quickInventoryAction(env.source, "apple", "transfer"), /inaccessible/);
    env.source.isOwner = true;
    Object.assign(env.source.items.get("apple"), { type: "weapon", system: { corporeal: true } });
    await assert.rejects(quickInventoryAction(env.source, "apple", "transfer"), /corporelle/);
    assert.equal(env.requests.length, 0);
});

test("quick-action buttons prevent double submission, cancel on close and re-enable buttons from a concurrent render", async () => {
    const env = environment(); game.user.targets.clear();
    const old = { dataset: { itemId: "apple", inventoryAction: "transfer" }, disabled: false };
    let buttons = [old];
    const sheet = { element: { querySelectorAll: () => buttons } };
    const operation = runQuickInventoryAction(sheet, env.source, old);
    assert.equal(old.disabled, true);
    assert.equal(await runQuickInventoryAction(sheet, env.source, old), undefined);
    const replacement = { disabled: true }; buttons = [replacement];
    sheet._inventoryQuickAbort.abort(); await operation;
    assert.equal(env.requests.length, 0);
    assert.equal(old.disabled, false); assert.equal(replacement.disabled, false);
    assert.equal(sheet._inventoryQuickBusy, false);
    assert.equal(env.view.events.size, 0);
});
