import test from "node:test";
import assert from "node:assert/strict";

class Sheet { async _onRender() {} async _processSubmitData() { return { updated: this.document }; } }
globalThis.foundry = { applications: { sheets: { ItemSheetV2: Sheet }, api: { HandlebarsApplicationMixin: Base => Base } } };
const { ArcaneInventoryItemSheet } = await import("../module/applications/item/inventory-item-sheet.mjs");
const { SceneryElementSheet } = await import("../module/applications/item/scenery-sheet.mjs");
const { GlyphSheet } = await import("../module/applications/item/glyph-sheet.mjs");

test("document editors enable explicit save-and-close while field changes keep their drafts open", () => {
    for (const Editor of [ArcaneInventoryItemSheet, SceneryElementSheet, GlyphSheet]) {
        assert.equal(Editor.DEFAULT_OPTIONS.form.closeOnSubmit, true);
        assert.equal(Editor.DEFAULT_OPTIONS.form.submitOnChange, false);
    }
});

test("a cancelled inventory write is an error, so Foundry keeps the editor open", async () => {
    const sheet = new ArcaneInventoryItemSheet();
    sheet.document = { id: "sword", actor: { type: "character", updateInventoryItem: async () => null } };
    await assert.rejects(sheet._processSubmitData(null, null, { name: "Épée" }, {}), /n’a pas pu être enregistré/);
    sheet.document.actor.updateInventoryItem = async () => sheet.document;
    assert.deepEqual(await sheet._processSubmitData(null, null, { name: "Épée" }, {}), { updated: sheet.document });
});

function sceneryFixture() {
    const calls = [], errors = [];
    const scene = { id: "scene", width: 1000, height: 1000, grid: { size: 100, distance: 1 }, tiles: new Set(["tile"]),
        async createEmbeddedDocuments(type) { assert.equal(type, "Tile"); calls.push("place"); return [{ id: "tile", parent: scene, getFlag: () => null }]; } };
    globalThis.game = { user: { isGM: true } };
    globalThis.canvas = { scene };
    globalThis.ui = { notifications: { error: message => errors.push(message) } };
    const sheet = { isEditable: true, form: { reportValidity: () => true },
        document: { type: "sceneryElement", name: "Table", system: {
            placement: { width: 1, height: 1 }, light: { enabled: false, color: "#ffffff" },
            mist: { enabled: false, color: "#ffffff" }, interaction: {}
        } },
        async submit() { calls.push("save"); }, async close() { calls.push("close"); } };
    return { calls, errors, sheet };
}

test("Save and place closes only after both document saving and scene placement succeed", async () => {
    const { calls, errors, sheet } = sceneryFixture();
    await SceneryElementSheet.onPlaceSceneObject.call(sheet);
    assert.deepEqual(errors, []);
    assert.deepEqual(calls, ["save", "place", "close"]);
});

test("Save and place preserves an invalid draft or a failed write without closing or placing it", async () => {
    for (const invalid of [true, false]) {
        const { calls, errors, sheet } = sceneryFixture();
        if (invalid) sheet.form.reportValidity = () => false;
        else sheet.submit = async () => { throw new Error("Sauvegarde impossible"); };
        await SceneryElementSheet.onPlaceSceneObject.call(sheet);
        assert.deepEqual(calls, []);
        assert.equal(errors.length, invalid ? 0 : 1);
    }
});
