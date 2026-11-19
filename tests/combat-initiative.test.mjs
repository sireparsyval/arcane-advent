import test from "node:test";
import assert from "node:assert/strict";
import { newEffectRule } from "../module/character-effects.mjs";

const messages = [], writes = [], calls = [];
let natural = 12;
function mergeObject(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            target[key] = mergeObject(target[key] ?? {}, value);
        } else target[key] = value;
    }
    return target;
}
class Roll {
    constructor(formula) { this.formula = formula; this.dice = [{ values: [natural] }]; }
    async evaluate() {
        const modifier = this.formula.match(/ ([+-]) (\d+)$/);
        this.total = this.dice[0].values[0] + (modifier ? Number(modifier[2]) * (modifier[1] === "+" ? 1 : -1) : 0);
        return this;
    }
    async render() { return `<h4 class="dice-total">${this.total}</h4>`; }
    async toMessage(data, { create = true, messageMode } = {}) {
        const chatData = { ...data, formula: this.formula, visibility: messageMode ?? "public", sound: "dice" };
        if (create) await foundry.documents.ChatMessage.create(chatData);
        return chatData;
    }
    static _mapLegacyRollMode(mode) { return { gmroll: "gm", blindroll: "blind" }[mode] ?? "public"; }
}
class Combat {
    async rollInitiative(ids, options) { calls.push({ native: ids, options }); return this; }
    async updateEmbeddedDocuments(type, updates, options) {
        writes.push({ type, updates, options });
        for (const { _id, initiative } of updates) this.combatants.get(_id).initiative = initiative;
    }
}
globalThis.Actor = class {};
globalThis.Item = class {};
globalThis.foundry = {
    utils: { mergeObject, escapeHTML: value => String(value).replaceAll("<", "&lt;") },
    dice: { Roll },
    documents: {
        Combat,
        ChatMessage: {
            getSpeaker: ({ actor, token, alias }) => ({ actor: actor?.id, token: token?.id, alias: alias ?? actor?.name }),
            create: async data => { messages.push(...(Array.isArray(data) ? data : [data])); }
        }
    }
};
globalThis.game = { i18n: { format: (_key, { name }) => `${name} — Initiative` } };
const { ArcaneActor } = await import("../module/documents/actor.mjs");
const { ArcaneCombat } = await import("../module/documents/combat.mjs");

function actor(type = "character", { modifier = 3, mode = "normal", rules = {} } = {}) {
    const document = new ArcaneActor();
    document.type = type;
    document.id = `actor-${type}`;
    document.name = type;
    document.items = [];
    document.system = { trackers: { initiative: modifier }, rollMode: mode, effectRules: rules };
    const roll = document.rollInitiativeCheck;
    document.rollInitiativeCheck = async function (...args) { calls.push({ actor: this, args }); return roll.apply(this, args); };
    return document;
}
function combatant(id, document, options = {}) {
    return { id, name: `Token ${id}`, actor: document, isOwner: true, initiative: null,
        token: { id: `token-${id}` }, getInitiativeRoll: () => new Roll("1d20"), ...options };
}
function encounter(...combatants) {
    messages.length = writes.length = calls.length = 0;
    natural = 12;
    const combat = new ArcaneCombat();
    combat.combatants = new Map(combatants.map(entry => [entry.id, entry]));
    combat.turn = 2;
    return combat;
}
const rule = changes => ({ ...newEffectRule("roll"), scope: "initiative", ...changes });

test("the tracker calls the combatant actor's live initiative check and records its final result once", async () => {
    const synthetic = actor("npc", { modifier: 5, mode: "disadvantage", rules: {
        alert: rule({ advantage: true, amount: 2 })
    } });
    synthetic.uuid = "Scene.other.Token.unlinked.Actor.actor-npc";
    const combat = encounter(combatant("npc", synthetic));
    assert.equal(await combat.rollInitiative("npc"), combat);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].actor, synthetic);
    assert.deepEqual(writes[0], { type: "Combatant", updates: [{ _id: "npc", initiative: 19 }], options: { turnEvents: false } });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].formula, "1d20 + 7");
    assert.match(messages[0].flavor, /Neutre/);
    assert.match(messages[0].content, />19<\/h4>/);
    assert.deepEqual(messages[0].speaker, { actor: synthetic.id, token: "token-npc", alias: "Token npc" });
    assert.equal(messages[0].flags["core.initiativeRoll"], true);
});

test("tracker initiative retains advantage, disadvantage, criticals and the minimum result from the sheet", async t => {
    for (const sample of [
        { natural: 12, modifier: 2, mode: "advantage", formula: "2d20kh + 2", total: 14 },
        { natural: 12, modifier: -3, mode: "disadvantage", formula: "2d20kl - 3", total: 9 },
        { natural: 1, modifier: 8, mode: "normal", formula: "1d20 + 8", total: 1 },
        { natural: 20, modifier: 8, mode: "normal", formula: "1d20 + 8", total: 20 },
        { natural: 2, modifier: -8, mode: "normal", formula: "1d20 - 8", total: 1 }
    ]) await t.test(`${sample.natural} ${sample.mode} ${sample.modifier}`, async () => {
        const combat = encounter(combatant("pc", actor("character", sample)));
        natural = sample.natural;
        await combat.rollInitiative(["pc"]);
        assert.equal(combat.combatants.get("pc").initiative, sample.total);
        assert.equal(messages[0].formula, sample.formula);
        assert.match(messages[0].content, new RegExp(`>${sample.total}</h4>`));
    });
});

test("group rolls update all owned combatants in one batch and keep hidden NPC results private", async () => {
    const combat = encounter(combatant("pc", actor()), combatant("hidden", actor("npc"), { hidden: true }),
        combatant("other", actor(), { isOwner: false }));
    await combat.rollInitiative(["missing", "pc", "hidden", "other"], { updateTurn: false });
    assert.equal(calls.length, 2);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].updates.length, 2);
    assert.deepEqual(writes[0].options, { turnEvents: false, combatTurn: 2 });
    assert.deepEqual(messages.map(message => message.visibility), ["public", "gm"]);
    assert.deepEqual(messages.map(message => message.sound), ["dice", null]);
    assert.equal(combat.combatants.get("other").initiative, null);
});

test("explicit chat visibility and metadata are respected without mutating caller options", async () => {
    const combat = encounter(combatant("hidden", actor("npc"), { hidden: true }));
    const options = { messageMode: "blind", messageOptions: { flags: { module: { test: true } }, flavor: "Surprise" } };
    const before = structuredClone(options);
    await combat.rollInitiative(["hidden"], options);
    assert.equal(messages[0].visibility, "blind");
    assert.equal(messages[0].flavor, "Surprise");
    assert.equal(messages[0].flags["core.initiativeRoll"], true);
    assert.equal(messages[0].flags.module.test, true);
    assert.deepEqual(options, before);
    await combat.rollInitiative(["hidden"], { messageOptions: { rollMode: "gmroll" } });
    assert.equal(messages[1].visibility, "gm");
    assert.equal("rollMode" in messages[1], false);
});

test("unowned or missing combatants do not roll, write or post messages", async () => {
    const combat = encounter(combatant("other", actor(), { isOwner: false }));
    assert.equal(await combat.rollInitiative(["other", "missing"]), combat);
    assert.equal(calls.length, 0);
    assert.equal(writes.length, 0);
    assert.equal(messages.length, 0);
});

test("actorless combatants and deliberately supplied formulas retain native support", async () => {
    const combat = encounter(combatant("marker", null, { hidden: true }));
    await combat.rollInitiative(["marker"]);
    assert.equal(combat.combatants.get("marker").initiative, 12);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].visibility, "gm");
    assert.equal(messages[0].flags["core.initiativeRoll"], true);
    await combat.rollInitiative(["marker"], { formula: "1d6", updateTurn: false });
    assert.equal(calls[0].options.formula, "1d6");
    assert.deepEqual(calls[0].native, ["marker"]);
    assert.equal(writes.length, 1);
});

test("the sheet's initiative check still creates its own single message by default", async () => {
    encounter();
    const result = await actor().rollInitiativeCheck();
    assert.equal(result.total, 15);
    assert.equal(messages.length, 1);
    assert.equal(writes.length, 0);
});
