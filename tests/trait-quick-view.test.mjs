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
        "details[data-source-effects][open]": [{ dataset: { sourceEffects: trait.id } }],
        "details[data-source-conditions][open]": [{ dataset: { sourceConditions: trait.id } }]
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
    assert.deepEqual(view.conditionEntries.map(({ label, manual }) => ({ label, manual })), [
        { label: "Transformation", manual: true }, { label: "Condition automatique", manual: false }
    ]);
    assert.ok(view.conditionEntries.every(entry => !("summary" in entry)));
    assert.equal(view.effectEntries[0].active, true);
    assert.equal(view.effectEntries[1].active, false);
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

function linkedAptitude(trait) {
    return {
        ...structuredClone(trait), id: "torrent", type: "aptitude", name: "Torrent Ailé",
        system: {
            ...structuredClone(trait.system), category: "technique", traitId: trait.id, level: 3, showOptions: {},
            effectDuration: { enabled: false, remaining: 0, unit: "turns" },
            recoveryCounter: { remaining: 0, max: 0, unit: "turns" },
            castingCounter: { remaining: 0, max: 0, unit: "turns" },
            chargeCounter: { remaining: 0, max: 0 }, rolls: {}, targeting: { mode: "self" }
        }
    };
}

test("Traits et Aptitudes partagent les mêmes récapitulatifs sans exposer les critères automatiques", async () => {
    const { sheet, trait } = fixture();
    trait.system.conditions.automatic.label = "Danger imminent";
    const aptitude = linkedAptitude(trait);
    sheet.actor.items.push(aptitude);
    const before = structuredClone(sheet.actor.items);
    sheet.element.querySelectorAll = selector => {
        if (selector === "details[data-source-effects][open]") return [{ dataset: { sourceEffects: aptitude.id } }];
        if (selector === "details[data-source-conditions][open]") return [{ dataset: { sourceConditions: trait.id } }];
        return [];
    };
    const context = await sheet._prepareContext({});
    const traitView = context.traits[0], aptitudeView = context.aptitudes[0];
    assert.deepEqual(aptitudeView.effectEntries, traitView.effectEntries);
    assert.deepEqual(aptitudeView.conditionEntries, traitView.conditionEntries);
    assert.equal(aptitudeView.conditionEntries[1].label, "Danger imminent");
    assert.equal(aptitudeView.effectsOpen, true);
    assert.equal(traitView.effectsOpen, false);
    assert.equal(aptitudeView.conditionsOpen, false);
    assert.equal(traitView.conditionsOpen, true);
    assert.deepEqual(sheet.actor.items, before);
});

for (const type of ["trait", "aptitude"]) {
    test(`la bascule manuelle d’un ${type} met à jour seulement son critère et recalcule son état`, async () => {
        const { sheet, trait } = fixture();
        const source = type === "trait" ? trait : linkedAptitude(trait);
        if (type === "aptitude") sheet.actor.items.push(source);
        sheet.actor.items.get = id => sheet.actor.items.find(item => item.id === id);
        const writes = [];
        source.update = async changes => {
            writes.push(changes);
            source.system.conditions.manual.enabled = changes["system.conditions.manual.enabled"];
        };
        const action = ArcaneCharacterSheet.DEFAULT_OPTIONS.actions.toggleManualCondition;
        const target = { dataset: { itemId: source.id, conditionId: "manual" } };
        const view = context => (type === "trait" ? context.traits : context.aptitudes)[0];
        for (const expected of [false, true]) {
            await action.call(sheet, null, target);
            assert.deepEqual(writes.at(-1), { "system.conditions.manual.enabled": expected });
            const context = await sheet._prepareContext({});
            assert.equal(view(context).conditionEntries[0].satisfied, expected);
            assert.equal(view(context).effectActive, expected);
        }
        await action.call({ isEditable: false }, null, target);
        await action.call(sheet, null, { dataset: { itemId: source.id, conditionId: "automatic" } });
        await action.call(sheet, null, { dataset: { itemId: source.id, conditionId: "missing" } });
        await action.call(sheet, null, { dataset: { itemId: "missing", conditionId: "manual" } });
        source.type = "object";
        await action.call(sheet, null, target);
        assert.equal(writes.length, 2);
    });
}
