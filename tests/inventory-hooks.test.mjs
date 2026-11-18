import test from "node:test";
import assert from "node:assert/strict";

globalThis.Item = class {
    static async _preCreateOperation() {}
    static async _preUpdateOperation() {}
    static async _preDeleteOperation() {}
};
globalThis.ui = { notifications: { warn() {} } };
const { ArcaneItem } = await import("../module/documents/item.mjs");
function entry(id, type, containerId = null) {
    return { id, type, system: { containerId, equipped: false },
        updateSource(changes) { for (const [key, value] of Object.entries(changes)) this.system[key.slice(7)] = value; } };
}
class Items extends Map { [Symbol.iterator]() { return this.values(); } }

test("storage and NPC creation preserve remapped nested containers", async () => {
    for (const type of ["storage", "npc", "character"]) {
        const bag = entry("bag", "container"), child = entry("child", "object", "bag");
        const parent = { type, items: new Items(), getFlag: () => null };
        await ArcaneItem._preCreateOperation([bag, child], { parent, keepId: true }, { isGM: true });
        assert.equal(child.system.containerId, "bag", type);
    }
});

test("storage edits accept valid containers but reject circular nesting", async () => {
    const bag = entry("bag", "container"), inner = entry("inner", "container", "bag");
    const parent = { type: "storage", items: new Items([[bag.id, bag], [inner.id, inner]]), getFlag: () => null };
    assert.equal(await ArcaneItem._preUpdateOperation([inner], { parent, updates: [{ _id: "inner", system: { containerId: null } }] }, { isGM: true }), undefined);
    assert.equal(await ArcaneItem._preUpdateOperation([bag], { parent, updates: [{ _id: "bag", system: { containerId: "inner" } }] }, { isGM: true }), false);
});

test("busy inventories block ordinary writes including GM edits", async () => {
    const object = entry("object", "object");
    const parent = { type: "storage", items: new Items(), getFlag: () => "request" };
    for (const hook of ["_preCreateOperation", "_preUpdateOperation", "_preDeleteOperation"]) {
        assert.equal(await ArcaneItem[hook]([object], { parent }, { isGM: true }), false);
        assert.equal(await ArcaneItem[hook]([object], { parent, aaTransfer: true }, { isGM: false }), false);
    }
    assert.equal(await ArcaneItem._preCreateOperation([object], { parent, aaTransfer: true }, { isGM: true }), undefined);
});

test("storage deletion rehomes surviving children without losing their contents", async () => {
    const bag = entry("bag", "container"), child = entry("child", "object", "bag");
    let changes;
    const parent = { type: "storage", items: new Items([[bag.id, bag], [child.id, child]]), getFlag: () => null,
        async updateEmbeddedDocuments(_type, updates) { changes = updates; return updates; } };
    await ArcaneItem._preDeleteOperation([bag], { parent }, { isGM: true });
    assert.deepEqual(changes, [{ _id: "child", "system.containerId": null }]);
});
