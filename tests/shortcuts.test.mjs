import test from "node:test";
import assert from "node:assert/strict";
import { hotbarRollData, registerArcaneHotbar, runArcaneShortcut } from "../module/shortcuts.mjs";

const calls = [], warnings = [], macros = [], assignments = [];
let actor, drop;
globalThis.fromUuid = async () => actor;
globalThis.ui = { notifications: { warn: message => warnings.push(message), error: message => warnings.push(message) } };
globalThis.Hooks = { on: (name, callback) => { if (name === "hotbarDrop") drop = callback; } };
globalThis.game = { user: { assignHotbarMacro: async (macro, slot) => assignments.push([macro, slot]) } };
globalThis.foundry = { documents: { Macro: { create: async data => { macros.push(data); return data; } } } };
function fixture(type = "character", isOwner = true) {
    calls.length = warnings.length = macros.length = assignments.length = 0;
    actor = { type, isOwner, uuid: "Actor.test", img: "portrait.png", system: { rollMode: "advantage" },
        rollAbility: async (...args) => calls.push(args), rollSkill: async (...args) => calls.push(args) };
}

test("the drag payload points at the live actor and roll rather than copying its formula", () => {
    const data = hotbarRollData({ uuid: "Actor.test" }, { dataset: { action: "rollAptitude", itemId: "aptitude", rollId: "attack" }, textContent: "  Attaque\n  ardente " });
    assert.deepEqual(data, { type: "ArcaneAdventRoll", actorUuid: "Actor.test", action: "rollAptitude", itemId: "aptitude", rollId: "attack", ability: "", label: "Attaque ardente" });
    assert.equal(hotbarRollData({}, { dataset: { action: "deleteTrait" } }), null);
});

test("shortcuts support both characters and NPCs and read the current manual roll mode", async () => {
    for (const type of ["character", "npc"]) {
        fixture(type);
        await runArcaneShortcut({ action: "rollAbility", actorUuid: actor.uuid, ability: "strength" });
        actor.system.rollMode = "disadvantage";
        await runArcaneShortcut({ action: "rollAbility", actorUuid: actor.uuid, ability: "strength" });
        assert.deepEqual(calls, [["strength", "advantage"], ["strength", "disadvantage"]]);
    }
});

test("missing, unsupported and unowned actors cannot execute a shortcut", async () => {
    for (const [type, owned] of [["storage", true], ["npc", false]]) {
        fixture(type, owned);
        await runArcaneShortcut({ action: "rollSkill", actorUuid: actor.uuid, itemId: "skill" });
        assert.equal(calls.length, 0); assert.equal(warnings.length, 1);
    }
    actor = null;
    await runArcaneShortcut({ action: "rollAbility", actorUuid: "Actor.deleted", ability: "strength" });
    assert.equal(calls.length, 0);
});

test("dropping an NPC roll creates and assigns a script macro in the selected slot", async () => {
    fixture("npc"); registerArcaneHotbar();
    assert.equal(drop({}, { type: "ArcaneAdventRoll", actorUuid: actor.uuid, action: "rollSkill", itemId: "skill", label: "Discrétion" }, 4), false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(macros.length, 1);
    assert.match(macros[0].command, /game\.arcaneAdvent\.runShortcut/);
    const payload = JSON.parse(macros[0].command.slice("await game.arcaneAdvent.runShortcut(".length, -2));
    assert.deepEqual(payload, { actorUuid: "Actor.test", action: "rollSkill", itemId: "skill", rollId: "", ability: "" });
    assert.equal(assignments[0][1], 4);
    fixture("storage");
    drop({}, { type: "ArcaneAdventRoll", actorUuid: actor.uuid, action: "rollSkill" }, 2);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(macros.length, 0);
});
