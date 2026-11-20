import test from "node:test";
import assert from "node:assert/strict";
import { canRollGuard, equippedGuardItems } from "../module/guard.mjs";

globalThis.Actor = class {};
globalThis.Item = class {};
globalThis.foundry = {
    abstract: { TypeDataModel: class {} }, data: { fields: {} },
    utils: { expandObject: value => {
        const expanded = {};
        for (const [path, entry] of Object.entries(value)) {
            const keys = path.split("."), leaf = keys.pop();
            const target = keys.reduce((node, key) => node[key] ??= {}, expanded);
            target[leaf] = structuredClone(entry);
        }
        return expanded;
    }, escapeHTML: value => value },
    applications: {
        sheets: { ActorSheetV2: class {} },
        api: { HandlebarsApplicationMixin: Base => Base }
    }
};
const { ArcaneActor } = await import("../module/documents/actor.mjs");
const { ArcaneCharacterSheet } = await import("../module/applications/actor/character-sheet.mjs");
class Items extends Map { [Symbol.iterator]() { return this.values(); } }
const weapon = (id = "sword", system = {}) => ({ id, name: id, type: "weapon",
    system: { equipped: true, properties: new Set(["guard"]), ...system } });
const shield = (id = "shield", system = {}) => ({ id, name: id, type: "shield",
    system: { equipped: true, guardEnabled: true, defenseBonus: 2, ...system } });
function actor(items, stance = "defend") {
    const actor = Object.assign(new ArcaneActor(), {
        items: new Items(items.map(item => [item.id, item])),
        system: { defense: { stance }, rollMode: "normal", abilities: {
            strength: { modifier: 2 }, dexterity: { modifier: 3 }, constitution: { modifier: -1 }
        } },
        getExpertiseBonus: () => 1,
        _rollD20: (...args) => args
    });
    return actor;
}

test("la Garde exige Se Défendre et un unique équipement compatible équipé", () => {
    const sword = weapon(), other = shield();
    for (const stance of ["none", "dodge", "defend"]) {
        const subject = actor([sword], stance);
        assert.equal(canRollGuard(subject, sword), stance === "defend");
        assert.equal(canRollGuard(subject, other), false);
    }
    assert.equal(canRollGuard(actor([sword, other]), sword), false);
    assert.equal(canRollGuard(actor([weapon("sword", { equipped: false })]), sword), false);
    assert.deepEqual(equippedGuardItems([sword, weapon("ordinary", { properties: [] }), shield("stored", { equipped: false })]), [sword]);
});

test("les jets de Garde utilisent le bon équipement et sont bloqués sans la stance", async () => {
    for (const [item, expected] of [[weapon(), 6], [shield(), 4]]) {
        const subject = actor([item]);
        const roll = await subject.rollGuard(item.id, "advantage");
        assert.equal(roll[0], expected);
        assert.equal(roll[1], "advantage");
        assert.match(roll[2], new RegExp(item.name));
        subject.system.defense.stance = "dodge";
        assert.equal(await subject.rollGuard(item.id), undefined);
        subject.system.defense.stance = "none";
        assert.equal(await subject.rollGuard(item.id), undefined);
    }
});

test("Esquive et Se Défendre se remplacent et un second clic retire la stance", async () => {
    const subject = actor([]);
    subject.update = async changes => { subject.system.defense.stance = changes["system.defense.stance"]; };
    const sheet = { actor: subject, isEditable: true };
    const toggle = key => ArcaneCharacterSheet.DEFAULT_OPTIONS.actions.toggleCombatStance.call(
        sheet, {}, { dataset: { combatStance: key } });
    await toggle("dodge");
    assert.equal(subject.system.defense.stance, "dodge");
    await toggle("defend");
    assert.equal(subject.system.defense.stance, "defend");
    await toggle("defend");
    assert.equal(subject.system.defense.stance, "none");
    await toggle("invalid");
    assert.equal(subject.system.defense.stance, "none");
    sheet.isEditable = false;
    await toggle("dodge");
    assert.equal(subject.system.defense.stance, "none");
});

test("équiper une nouvelle Garde déséquipe la précédente sans toucher aux autres équipements", async () => {
    for (const [previous, next] of [[weapon(), shield("new", { equipped: false })],
        [shield(), weapon("new", { equipped: false })], [weapon(), weapon("new", { equipped: false })]]) {
        const ordinary = weapon("ordinary", { properties: new Set() });
        const subject = actor([previous, next, ordinary]);
        let updates;
        subject.updateEmbeddedDocuments = async (_type, changes) => {
            updates = changes;
            return changes.map(change => subject.items.get(change._id));
        };
        await subject.setEquipmentEquipped(next.id, true);
        assert.equal(updates.find(update => update._id === previous.id)?.system.equipped, false);
        assert.equal(updates.some(update => update._id === ordinary.id), false);
    }
});
