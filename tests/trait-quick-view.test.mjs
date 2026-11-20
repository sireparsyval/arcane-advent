import test from "node:test";
import assert from "node:assert/strict";

globalThis.Item = class {};
globalThis.foundry = {
    abstract: { TypeDataModel: class {} },
    data: { fields: {} },
    applications: {
        sheets: { ActorSheetV2: class { async _prepareContext() { return {}; } } },
        api: { HandlebarsApplicationMixin: Base => Base }
    }
};

const { ArcaneCharacterSheet } = await import("../module/applications/actor/character-sheet.mjs");

function fixture(editable = true) {
    const trait = {
        id: "dragon", type: "trait", name: "Enfant de Dragon", sort: 1,
        system: {
            description: "Exceptions conservées", requirements: "Ancienne note conservée",
            effectActivation: { enabled: true, mode: "conditions" }, conditionMatch: "any",
            effectRules: {
                force: { kind: "stat", target: "strength", amount: 2, coefficient: 1, enabled: true },
                save: { kind: "roll", scope: "save", advantage: true, enabled: false }
            },
            conditions: {
                manual: { kind: "manual", label: "Transformation", enabled: true },
                automatic: { kind: "automatic", metric: "pdc", operator: "<", value: 5 }
            }
        }
    };
    const keys = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
    const system = {
        identity: {}, abilities: Object.fromEntries(keys.map(key => [key, { value: 10, modifier: 0 }])),
        savingThrows: Object.fromEntries(keys.map(key => [key, { mastery: 0, total: 0 }])),
        defense: { zones: {}, shieldBonus: 0 }, deathSaves: {},
        consciousness: { value: 10, max: 20, effectiveMax: 20 },
        fever: { value: 0, max: 5, effectiveMax: 5 },
        consciousnessDice: { value: 1, max: 1, effectiveMax: 1 },
        modifierTotals: {}, manualModifiers: {}, trackers: {},
        encumbrance: { stage: "free", carried: 0, maximum: 100, percentage: 0 }
    };
    const sheet = Object.create(ArcaneCharacterSheet.prototype);
    Object.defineProperty(sheet, "isEditable", { value: editable });
    sheet.actor = {
        items: [trait], system, getFlag: () => true,
        inventory: { roots: [], totalWeight: 0 },
        async createEmbeddedDocuments(type, documents) { return { type, documents }; }
    };
    const open = {
        "details[data-trait-effects][open]": [{ dataset: { traitEffects: trait.id } }],
        "details[data-trait-conditions][open]": [{ dataset: { traitConditions: trait.id } }]
    };
    sheet.element = { querySelector: () => null, querySelectorAll: selector => open[selector] ?? [] };
    return { sheet, trait };
}

test("les Traits exposent leurs effets et critères avec leurs états et conservent les volets ouverts", async () => {
    const { sheet, trait } = fixture();
    const before = structuredClone(trait);
    const context = await sheet._prepareContext({});
    const view = context.traits[0];
    assert.equal(view.effectsOpen, true);
    assert.equal(view.conditionsOpen, true);
    assert.equal(view.effectCount, 2);
    assert.equal(view.effectActive, true);
    assert.match(view.effectEntries[0].summary, /Force.*\+2/);
    assert.equal(view.effectEntries[0].status, "Actif");
    assert.equal(view.effectEntries[1].status, "Désactivé");
    assert.deepEqual(view.conditionEntries.map(entry => entry.satisfied), [true, false]);
    assert.equal(view.conditionMatchLabel, "Au moins un critère");
    assert.match(view.activationLabel, /conditions/);
    assert.deepEqual(trait, before);
});

test("les volets restent consultables sans édition et gèrent un Trait sans effets ni critères", async () => {
    const { sheet, trait } = fixture(false);
    trait.system.effectRules = {};
    trait.system.conditions = {};
    const context = await sheet._prepareContext({});
    assert.equal(context.canEditState, false);
    assert.deepEqual(context.traits[0].effectEntries, []);
    assert.deepEqual(context.traits[0].conditionEntries, []);
    assert.equal(context.traits[0].effectActive, false);
});

test("le bouton de création lie immédiatement la nouvelle Aptitude au Trait et respecte les permissions", async () => {
    const { sheet, trait } = fixture();
    sheet.actor.items.get = id => sheet.actor.items.find(item => item.id === id);
    const created = [];
    sheet.actor.createEmbeddedDocuments = async (type, documents) => created.push({ type, documents });
    const action = ArcaneCharacterSheet.DEFAULT_OPTIONS.actions.createLinkedAptitude;
    await action.call(sheet, null, { dataset: { traitId: trait.id } });
    assert.equal(created.length, 1);
    assert.equal(created[0].type, "Item");
    assert.equal(created[0].documents[0].type, "aptitude");
    assert.equal(created[0].documents[0].system.traitId, trait.id);
    await action.call({ isEditable: false }, null, { dataset: { traitId: trait.id } });
    assert.equal(created.length, 1);
});

for (const [actionName, itemType, dataKey, rowAttribute] of [
    ["goToLinkedTrait", "trait", "traitId", "data-trait-row"],
    ["goToLinkedAptitude", "aptitude", "itemId", "data-aptitude-row"]
]) {
    test(`${actionName} rejoint la bonne carte, même sans permission d’édition`, () => {
        const item = { id: "linked-item", type: itemType };
        const calls = [];
        const sheet = {
            isEditable: false,
            actor: { items: new Map([[item.id, item]]) },
            element: {
                querySelector(selector) {
                    assert.equal(selector, `[${rowAttribute}="${item.id}"]`);
                    return { scrollIntoView: options => calls.push(options) };
                }
            }
        };
        const action = ArcaneCharacterSheet.DEFAULT_OPTIONS.actions[actionName];
        action.call(sheet, null, { dataset: { [dataKey]: item.id } });
        assert.deepEqual(calls, [{ behavior: "smooth", block: "nearest" }]);

        // Un élément disparu ou d’un autre type ne doit pas déclencher de navigation.
        action.call(sheet, null, { dataset: { [dataKey]: "missing" } });
        item.type = "weapon";
        action.call(sheet, null, { dataset: { [dataKey]: item.id } });
        assert.equal(calls.length, 1);

        item.type = itemType;
        sheet.element.querySelector = () => null;
        assert.doesNotThrow(() => action.call(sheet, null, { dataset: { [dataKey]: item.id } }));
    });
}
