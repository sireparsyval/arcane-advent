import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createCharacterHotbarClass, createCharacterHotbarUserClass } from "../module/character-hotbar.mjs";

// Optional local integration against the owner's installed, licensed Foundry.
// No Foundry source is redistributed with this system.
const client = process.env.FOUNDRY_CLIENT_PATH;
test("clic, clavier et menu utilisent les mêmes slots avec la vraie Hotbar Foundry v14", { skip: !client }, async () => {
    const code = (await readFile(join(client, "applications/ui/hotbar.mjs"), "utf8"))
        .replace(/^import .*;\r?$/gm, "").replace("export default class Hotbar", "return class Hotbar");
    globalThis._loc = value => value;
    const Native = new Function("ApplicationV2", "HandlebarsApplicationMixin", "fromUuid", "getDocumentClass", "TextEditor", "Hooks", "Macro", code)
        (class {}, Base => Base, () => {}, () => {}, {}, {}, class {});
    let normalExec = 0, sharedExec = 0, edits = 0;
    const normal = { id: "normal", name: "Personnel", execute() { normalExec++; }, isOwner: true, sheet: { render() { edits++; } } };
    const shared = { id: "shared", name: "Commun", execute() { sharedExec++; }, isOwner: true, sheet: { render() { edits++; } } };
    const slots = { 1: "shared" };
    const actor = { uuid: "Actor.a", type: "character", isOwner: true, getFlag: () => ({ slots }) };
    const User = createCharacterHotbarUserClass(class {
        hotbar = { 1: "normal" }; mode = true;
        getFlag() { return this.mode; }
        getHotbarMacros(page = 1) { return Array.from({ length: 10 }, (_, i) => ({ slot: (page - 1) * 10 + i + 1, macro: i === 0 ? normal : null })); }
    });
    const user = new User(); globalThis.game = { user, macros: new Map([["normal", normal], ["shared", shared]]) };
    globalThis.canvas = { ready: true, tokens: { controlled: [{ actor }] } };
    const Hotbar = createCharacterHotbarClass(Native), hotbar = new Hotbar();
    const entry = { dataset: { slot: "1" }, closest() { return this; } };
    const data = await hotbar._prepareContext({});
    assert.equal(data.slots[0].macro, shared);
    await Hotbar.DEFAULT_OPTIONS.actions.execute.call(hotbar, { target: entry });
    assert.equal(sharedExec, 1); assert.equal(normalExec, 0);
    hotbar.slots.find(slot => slot.key === 1).macro.execute();
    assert.equal(sharedExec, 2);
    hotbar._getContextMenuOptions().find(item => item.label === "MACRO.Edit").onClick(null, entry);
    assert.equal(edits, 1);
    // Without another render, keyboard and click must immediately use the
    // personal bar after selection ends, despite core's cached rendered slots.
    canvas.tokens.controlled = [];
    assert.equal(hotbar.slots[0].macro, normal);
    await Hotbar.DEFAULT_OPTIONS.actions.execute.call(hotbar, { target: entry });
    assert.equal(normalExec, 1); assert.equal(sharedExec, 2);
    assert.deepEqual(user.hotbar, { 1: "normal" });
});
