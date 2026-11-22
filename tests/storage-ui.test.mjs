import test from "node:test";
import assert from "node:assert/strict";
class Application {
    async _onRender() {}
    async _onClose() {}
    async _prepareContext() { return {}; }
    render() { this.refreshes = (this.refreshes ?? 0) + 1; }
}
globalThis.foundry = { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: base => base } } };
let serial = 0;
const callbacks = new Map();
globalThis.Hooks = {
    on(name, callback) { const id = ++serial; callbacks.set(id, { name, callback }); return id; },
    off(_name, id) { callbacks.delete(id); }
};
const { StorageDirectory, registerStorageDirectory } = await import("../module/applications/storage-directory.mjs");

test("the storage directory refreshes on scene changes, cleans hooks on close and works when reopened", async () => {
    const app = new StorageDirectory();
    await app._onRender({}, {});
    assert.ok([...callbacks.values()].some(entry => entry.name === "canvasReady"));
    const count = callbacks.size;
    for (const entry of callbacks.values()) entry.callback();
    assert.equal(app.refreshes, count);
    await app._onRender({}, {});
    assert.equal(callbacks.size, count);
    await app._onClose({});
    assert.equal(callbacks.size, 0);
    await app._onRender({}, {});
    assert.equal(callbacks.size, count);
    await app._onClose({});
});

test("the directory separates storage Items and legacy deposits without listing the technical Actor", async () => {
    const stored = (uuid, ground, flags = {}, isToken = false) => ({
        uuid, type: "storage", name: uuid, system: { ground }, isToken,
        getFlag: (_scope, key) => flags[key]
    });
    const permanent = stored("Actor.chest", false), legacy = stored("Actor.old-ground", true);
    const template = stored("Actor.model", true, { groundTemplate: true });
    const copy = { ...stored("Item.ground", true, { inventoryBusy: "interrupted" }), documentName: "Item" };
    const chest = { ...stored("Item.chest", false), documentName: "Item" };
    const placed = { ...stored("Item.placed-chest", false, { sceneInventoryInstance: true }), documentName: "Item" };
    globalThis.game = { user: { isGM: true, viewedScene: "current" }, actors: [permanent, legacy, template],
        items: [chest, copy, placed], scenes: new Map() };
    const context = await new StorageDirectory()._prepareContext({});
    assert.deepEqual(context.actors.map(entry => entry.uuid), [chest.uuid, permanent.uuid]);
    assert.deepEqual(context.groundDeposits.map(entry => entry.uuid), [copy.uuid, placed.uuid, legacy.uuid]);
    assert.deepEqual(context.interrupted.map(entry => entry.uuid), [copy.uuid]);
});

test("the Items sidebar hides existing ground inventories and marked scene copies while retaining reusable models", () => {
    const entry = (type, ground = false, instance = false) => ({ type, system: { ground },
        getFlag: (_scope, key) => key === "sceneInventoryInstance" && instance });
    const items = new Map([
        ["model", entry("weapon")], ["storage-model", entry("storage")],
        ["old-ground", entry("storage", true)], ["new-copy", entry("storage", false, true)]
    ]);
    globalThis.game = { items, settings: { registerMenu() {} } };
    class Surface {
        constructor(existingFooter) { this.rows = [...items.keys()].map(id => ({ dataset: { entryId: id }, remove() { this.removed = true; } })); this.existingFooter = existingFooter; }
        querySelectorAll(selector) { assert.equal(selector, ".directory-item[data-entry-id]"); return this.rows; }
        querySelector(selector) { assert.equal(selector, ".directory-footer"); return this.existingFooter ? { querySelector: () => ({}) } : null; }
    }
    globalThis.HTMLElement = Surface;
    registerStorageDirectory();
    const render = [...callbacks.values()].find(callback => callback.name === "renderItemDirectory").callback;
    // Filtering must still happen for partial renders and when the Stockages
    // footer button already exists, rather than returning before hiding rows.
    for (const existingFooter of [false, true]) {
        const surface = new Surface(existingFooter);
        render({}, surface);
        assert.deepEqual(surface.rows.filter(row => !row.removed).map(row => row.dataset.entryId), ["model", "storage-model"]);
    }
    assert.equal(items.size, 4, "Filtering must never delete persistent scene inventories");
});
