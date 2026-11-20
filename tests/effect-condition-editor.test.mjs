import test from "node:test";
import assert from "node:assert/strict";
import { newEffectRule } from "../module/character-effects.mjs";
import { openCharacterEffectsEditor } from "../module/applications/character-effects-editor.mjs";

const errors = [], notices = [];
let latest, serial = 0;
class Dialog extends EventTarget {
    constructor(config) {
        super(); this.config = config;
        this.root = { innerHTML: "", listeners: new Map(), querySelectorAll: () => [],
            addEventListener(name, callback) { this.listeners.set(name, callback); },
            removeEventListener(name) { this.listeners.delete(name); } };
        this.element = { querySelector: () => this.root };
        latest = this;
    }
    async render() { this.dispatchEvent(new Event("render")); return this; }
    async close() { this.closed = true; }
}
globalThis.foundry = { utils: { randomID: () => `copy${++serial}` },
    data: { operators: { ForcedDeletion: class {} } }, applications: { api: { DialogV2: Dialog } } };
globalThis.document = { createElement: () => ({ innerHTML: "" }) };
globalThis.ui = { notifications: { error: text => errors.push(text), warn: text => notices.push(text) } };

async function fixture(type = "trait") {
    errors.length = notices.length = 0; serial = 0;
    const writes = [];
    const owner = { id: "owner", name: "Test", type, isOwner: true, system: {
        category: "passive", effectActivation: { mode: "conditions", enabled: true }, conditionMatch: "all",
        conditions: { ready: { kind: "manual", label: "Prêt <ici>", enabled: true },
            weather: { kind: "manual", label: "Météo", enabled: false } },
        effectRules: { first: { ...newEffectRule(), amount: 2 }, second: { ...newEffectRule("roll"), advantage: true } }
    }, async update(changes) { writes.push(changes); } };
    const actor = { system: {}, items: [owner, { type: "trait", system: { conditions: { foreign: { label: "Autre Trait" } } } }] };
    const dialog = await openCharacterEffectsEditor(owner, { actor });
    return { owner, actor, dialog, writes };
}
function change(dialog, ruleId, dataset, value, checkbox = false) {
    const card = { dataset: { effectRule: ruleId }, querySelector: () => ({ textContent: "" }) };
    const target = { dataset, type: checkbox ? "checkbox" : "select-one", value, checked: value,
        closest: () => card };
    // Browsers may dispatch input followed by change; selected IDs must stay unique.
    for (const name of ["input", "change"]) dialog.root.listeners.get(name)({ target });
}
const click = (dialog, dataset) => dialog.root.listeners.get("click")({ target: { closest: () => ({ dataset, hasAttribute: () => false }) } });
const save = dialog => dialog.config.buttons.find(button => button.action === "save").callback(null,
    { form: { querySelector: () => null, reportValidity: () => true } }, dialog);

for (const type of ["trait", "aptitude"]) {
    test(`l’éditeur d’un ${type} enregistre plusieurs conditions et une combinaison propre à chaque effet`, async () => {
        const { owner, dialog, writes } = await fixture(type);
        const before = structuredClone(owner.system);
        change(dialog, "first", { efield: "conditionMode" }, "selected");
        assert.match(dialog.root.innerHTML, /Prêt &lt;ici&gt;/);
        assert.doesNotMatch(dialog.root.innerHTML, /data-rule-condition-id="foreign"/);
        change(dialog, "first", { ruleConditionId: "ready" }, true, true);
        change(dialog, "first", { ruleConditionId: "weather" }, true, true);
        change(dialog, "first", { efield: "conditionMatch" }, "any");
        click(dialog, { effectTab: "preview" });
        assert.match(dialog.root.innerHTML, /Actif —/);
        click(dialog, { effectTab: "effects" });
        assert.match(dialog.root.innerHTML, /data-rule-condition-id="ready" checked/);
        assert.match(dialog.root.innerHTML, /data-rule-condition-id="weather" checked/);
        assert.match(dialog.root.innerHTML, /value="any" selected/);
        await save(dialog);
        assert.deepEqual(errors, []);
        assert.deepEqual(writes[0]["system.effectRules"].first.conditionIds, ["ready", "weather"]);
        assert.equal(writes[0]["system.effectRules"].first.conditionMatch, "any");
        assert.deepEqual(writes[0]["system.effectRules"].second, before.effectRules.second);
        assert.deepEqual(owner.system, before);
    });
}

test("dupliquer un effet conserve sa sélection sans partager la liste avec l’original", async () => {
    const { dialog, writes } = await fixture();
    change(dialog, "first", { efield: "conditionMode" }, "selected");
    change(dialog, "first", { ruleConditionId: "ready" }, true, true);
    click(dialog, { duplicateEffect: "first" });
    change(dialog, "copy1", { ruleConditionId: "weather" }, true, true);
    await save(dialog);
    assert.deepEqual(errors, []);
    assert.deepEqual(writes[0]["system.effectRules"].first.conditionIds, ["ready"]);
    assert.deepEqual(writes[0]["system.effectRules"].copy1.conditionIds, ["ready", "weather"]);
});

test("supprimer une condition sélectionnée demande de corriger la sélection sans activer silencieusement un effet", async () => {
    const { dialog, writes } = await fixture();
    change(dialog, "first", { efield: "conditionMode" }, "selected");
    change(dialog, "first", { ruleConditionId: "weather" }, true, true);
    click(dialog, { removeCondition: "weather" });
    await save(dialog);
    assert.equal(writes.length, 0);
    assert.match(errors[0], /condition sélectionnée.*supprimée/);
    assert.match(dialog.root.innerHTML, /Condition supprimée/);
    change(dialog, "first", { ruleConditionId: "weather" }, false, true);
    await save(dialog);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0]["system.effectRules"].first.conditionIds, []);
});

test("une sélection vide explicite peut être enregistrée et Annuler ne modifie rien", async () => {
    const { owner, dialog, writes } = await fixture();
    change(dialog, "first", { efield: "conditionMode" }, "selected");
    change(dialog, "second", { efield: "conditionMode" }, "selected");
    click(dialog, { removeCondition: "ready" });
    click(dialog, { removeCondition: "weather" });
    await save(dialog);
    assert.deepEqual(errors, []);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0]["system.effectRules"].first.conditionIds, []);
    const before = structuredClone(owner.system);
    const another = await openCharacterEffectsEditor(owner, { actor: { system: {}, items: [] } });
    change(another, "first", { efield: "conditionMode" }, "selected");
    await another.config.buttons.find(button => button.action === "cancel").callback(null, null, another);
    assert.equal(writes.length, 1);
    assert.deepEqual(owner.system, before);
});

test("un utilisateur sans droit de modification ne peut pas ouvrir l’éditeur", async () => {
    const { owner, actor } = await fixture();
    const previous = latest;
    owner.isOwner = false;
    await openCharacterEffectsEditor(owner, { actor });
    assert.equal(latest, previous);
    assert.match(notices[0], /droit de modifier/);
});

test("l’éditeur conserve la référence, affiche sa valeur et refuse une valeur introuvable ou non entière", async () => {
    const { actor, owner, writes } = await fixture();
    actor.system.abilities = { strength: { value: 16, modifier: 3 } };
    const dialog = await openCharacterEffectsEditor(owner, { actor });
    change(dialog, "second", { efield: "amount" }, "@abilities.strength.modifier");
    click(dialog, { effectTab: "preview" });
    assert.match(dialog.root.innerHTML, /\+3/);
    click(dialog, { effectTab: "effects" });
    assert.match(dialog.root.innerHTML, /value="@abilities.strength.modifier"/);
    assert.match(dialog.root.innerHTML, /Valeur actuelle : \+3/);
    await save(dialog);
    assert.deepEqual(errors, []);
    assert.equal(writes[0]["system.effectRules"].second.amountFormula, "@abilities.strength.modifier");
    assert.equal(writes[0]["system.effectRules"].second.amount, 0);

    const other = await openCharacterEffectsEditor(owner, { actor });
    change(other, "second", { efield: "amount" }, "@abilities.missing.value");
    await save(other);
    assert.equal(writes.length, 1);
    assert.match(errors.at(-1), /introuvable/);
    change(other, "second", { efield: "amount" }, "1.5");
    await save(other);
    assert.equal(writes.length, 1);
    assert.match(errors.at(-1), /entier/);
    change(other, "second", { efield: "amount" }, "-2");
    await save(other);
    assert.equal(writes.length, 2);
    assert.equal(writes[1]["system.effectRules"].second.amount, -2);
    assert.equal(writes[1]["system.effectRules"].second.amountFormula, "");
});

test("un Trait ou une Aptitude sans personnage conserve les références en attente de leur futur propriétaire", async () => {
    const { owner, dialog, writes } = await fixture();
    change(dialog, "second", { efield: "amount" }, "@abilities.strength.modifier");
    click(dialog, { effectTab: "effects" });
    assert.match(dialog.root.innerHTML, /Valeur calculée une fois/);
    await save(dialog);
    assert.deepEqual(errors, []);
    assert.equal(writes[0]["system.effectRules"].second.amountFormula, "@abilities.strength.modifier");
    assert.equal(owner.system.effectRules.second.amountFormula, "");
});

test("les formules saisies sont prévisualisées et enregistrées sans modifier les valeurs du personnage", async () => {
    const { owner, actor, writes } = await fixture();
    actor.system.abilities = { dexterity: { modifier: 2 }, constitution: { modifier: 4 } };
    const before = structuredClone(actor.system);
    const dialog = await openCharacterEffectsEditor(owner, { actor });
    assert.equal(owner.system.effectRules.second.amountFormula, "");
    change(dialog, "second", { efield: "amount" }, "max(mod.dex, mod.con)");
    click(dialog, { effectTab: "effects" });
    assert.match(dialog.root.innerHTML, /Valeur actuelle : \+4/);
    assert.match(dialog.root.innerHTML, /value="max\(mod.dex, mod.con\)"/);
    await save(dialog);
    assert.deepEqual(errors, []);
    assert.equal(writes[0]["system.effectRules"].second.amountFormula, "max(mod.dex, mod.con)");
    assert.deepEqual(actor.system, before);
    const other = await openCharacterEffectsEditor(owner, { actor });
    change(other, "second", { efield: "amount" }, "max(mod.dex,)");
    await save(other);
    assert.equal(writes.length, 1);
    assert.ok(errors.length);
});
