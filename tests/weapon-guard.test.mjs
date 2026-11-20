import test from "node:test";
import assert from "node:assert/strict";
import { guardValues } from "../module/guard.mjs";

globalThis.foundry = {
    abstract: { TypeDataModel: class { static migrateData(source) { return source; } } },
    data: { fields: {} },
    applications: {
        api: { HandlebarsApplicationMixin: Base => Base },
        sheets: { ItemSheetV2: class {
            async _prepareContext() { return {}; }
            _processFormData(_event, _form, formData) { return formData; }
        } }
    }
};
globalThis.Item = class { async _preUpdate() {} };
const { WeaponData } = await import("../module/data/weapon-data.mjs");
const { ArcaneItem, getEquipmentConflictType } = await import("../module/documents/item.mjs");
const { ArcaneInventoryItemSheet } = await import("../module/applications/item/inventory-item-sheet.mjs");

test("les anciennes armes de Garde conservent leurs propriétés et deviennent utilisables", () => {
    for (const properties of [["twoHanded", "heavy"], new Set(["finesse"]), undefined]) {
        const source = { equipped: true, guardEnabled: true, properties };
        WeaponData.migrateData(source);
        assert.deepEqual(source.properties, [...(properties ?? []), "guard"]);
        assert.equal(source.guardEnabled, false);
        assert.deepEqual(guardValues({ type: "weapon", system: source }, {
            strengthModifier: 2, dexterityModifier: 3, constitutionModifier: -1, expertiseBonus: 1
        }), { defense: 16, savingThrowModifier: 6 });
        const migrated = structuredClone(source);
        WeaponData.migrateData(source);
        assert.deepEqual(source, migrated);
    }
});

test("Deux mains ne crée pas la propriété Garde et une Garde existante n'est pas dupliquée", () => {
    const ordinary = { guardEnabled: false, properties: ["twoHanded"] };
    WeaponData.migrateData(ordinary);
    assert.deepEqual(ordinary.properties, ["twoHanded"]);
    const existing = { guardEnabled: true, properties: ["guard", "finesse"] };
    WeaponData.migrateData(existing);
    assert.deepEqual(existing.properties, ["guard", "finesse"]);
});

test("décocher Garde ou retirer Deux mains ne réactive ni ne supprime involontairement Garde", async () => {
    for (const properties of [["finesse"], ["guard", "finesse"]]) {
        const item = { type: "weapon", system: { guardEnabled: true, properties: new Set(["guard", "twoHanded"]) } };
        const changes = { system: { properties } };
        await ArcaneItem.prototype._preUpdate.call(item, changes, {}, {});
        assert.equal(changes.system.guardEnabled, false);
        const reloaded = { ...item.system, ...changes.system };
        WeaponData.migrateData(reloaded);
        assert.deepEqual(reloaded.properties, properties);
    }
});

test("la Garde d'un bouclier reste configurable indépendamment des propriétés d'armes", async () => {
    const changes = { system: { properties: [], guardEnabled: true } };
    await ArcaneItem.prototype._preUpdate.call({ type: "shield", system: {} }, changes, {}, {});
    assert.equal(changes.system.guardEnabled, true);
    assert.equal(getEquipmentConflictType("weapon", new Set(["guard"])), null);
    assert.equal(getEquipmentConflictType("weapon", new Set(["guard", "twoHanded"])), "shield");
});

test("la fiche d'arme propose Garde et enregistre le choix sans exiger Deux mains", async () => {
    const sheet = Object.create(ArcaneInventoryItemSheet.prototype);
    sheet.document = { type: "weapon", system: {
        properties: new Set(["guard", "custom"]), damageTypes: new Set(["Tranchants"])
    } };
    const context = await sheet._prepareContext({});
    assert.deepEqual(context.weaponProperties.find(property => property.key === "guard"),
        { key: "guard", label: "Garde", checked: true });
    for (const checked of [[], ["guard"]]) {
        const form = {
            querySelectorAll: () => checked.map(value => ({ value })),
            querySelector: () => ({ value: "Tranchants" })
        };
        const data = sheet._processFormData(null, form, { name: "Épée", system: {} });
        assert.deepEqual(data.system.properties, ["custom", ...checked]);
        assert.equal(data.system.guardEnabled, false);
    }
});
