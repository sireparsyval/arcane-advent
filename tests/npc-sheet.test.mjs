import test from "node:test";
import assert from "node:assert/strict";

globalThis.Item = class {};
globalThis.foundry = {
    abstract: { TypeDataModel: class {} },
    data: { fields: {} },
    applications: {
        sheets: { ActorSheetV2: class {
            _configureRenderParts() { return structuredClone(this.constructor.PARTS); }
        } },
        api: { HandlebarsApplicationMixin: Base => Base }
    }
};
globalThis.ui = { notifications: { error: () => {} } };
const { ArcaneCharacterSheet } = await import("../module/applications/actor/character-sheet.mjs");

function fixture(type = "npc", editable = true) {
    const stored = {
        type, name: "Sentinelle", flags: { other: { retained: "conservé" } },
        system: {
            biography: { family: "Famille", motivation: "Motivation" },
            arcanology: { glyphs: { first: { glyphId: "G019", meaning: "Hypothèse" } } },
            deathSaves: { successes: 2, failures: 1 }, mercy: 4,
            manualModifiers: { strength: 2 }
        },
        items: [{ _id: "weapon", type: "weapon", system: { equipped: true, damageFormula: "2d6" } }]
    };
    const writes = [];
    const sheet = Object.create(ArcaneCharacterSheet.prototype);
    Object.defineProperty(sheet, "isEditable", { value: editable });
    sheet.actor = {
        getFlag: (scope, key) => stored.flags[scope]?.[key],
        setFlag: async (scope, key, value) => {
            writes.push({ scope, key, value });
            (stored.flags[scope] ??= {})[key] = value;
        }
    };
    return { sheet, stored, writes };
}

test("le mode compact sélectionne un autre modèle sans modifier le modèle partagé", async () => {
    const { sheet } = fixture();
    const options = {};
    const original = structuredClone(ArcaneCharacterSheet.PARTS);
    assert.ok(sheet._configureRenderParts(options).body.template.endsWith("character-sheet.hbs"));
    await sheet.actor.setFlag("arcane-advent", "compactNPC", true);
    const parts = sheet._configureRenderParts(options);
    assert.ok(parts.body.template.endsWith("npc-sheet.hbs"));
    assert.deepEqual(parts.body.templates, original.body.templates);
    assert.deepEqual(ArcaneCharacterSheet.PARTS, original);
});

test("l’aller-retour compact conserve toutes les données d’un PNJ ou personnage", async () => {
    for (const type of ["npc", "character"]) {
        const { sheet, stored, writes } = fixture(type);
        const original = structuredClone(stored);
        for (const checked of [true, false]) {
            let stopped = false;
            const control = { checked, disabled: false };
            await sheet._onCompactNPCChange({ currentTarget: control, stopPropagation() { stopped = true; } });
            assert.equal(stopped, true);
            assert.equal(control.disabled, false);
            assert.equal(sheet.compactNPC, checked);
            assert.deepEqual(stored.system, original.system);
            assert.deepEqual(stored.items, original.items);
            assert.equal(stored.type, original.type);
            assert.equal(stored.name, original.name);
            assert.deepEqual(stored.flags.other, original.flags.other);
        }
        assert.deepEqual(writes, [
            { scope: "arcane-advent", key: "compactNPC", value: true },
            { scope: "arcane-advent", key: "compactNPC", value: false }
        ]);
    }
});

test("une fiche en lecture seule ne peut pas changer le mode", async () => {
    const { sheet, writes } = fixture("npc", false);
    await sheet._onCompactNPCChange({ currentTarget: { checked: true }, stopPropagation() {} });
    assert.deepEqual(writes, []);
    assert.equal(sheet.compactNPC, false);
});
