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
const { StorageDirectory } = await import("../module/applications/storage-directory.mjs");

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
