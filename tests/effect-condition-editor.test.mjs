import test from "node:test";
import assert from "node:assert/strict";
import { newEffectRule } from "../module/character-effects.mjs";
import { openCharacterEffectsEditor, openCharacterEffectsManager } from "../module/applications/character-effects-editor.mjs";
import { traitParameterClipboard } from "../module/trait-clipboard.mjs";

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
    async close() { this.closed = true; this.dispatchEvent(new Event("close")); }
}
globalThis.foundry = { utils: { randomID: () => `copy${++serial}` },
    data: { operators: { ForcedDeletion: class {} } }, applications: { api: { DialogV2: Dialog } } };
globalThis.document = { createElement: () => ({ innerHTML: "" }) };
const actorHooks = new Map();
let hookId = 0;
globalThis.Hooks = {
    on(name, listener) { const id = ++hookId; actorHooks.set(id, { name, listener }); return id; },
    off(_name, id) { actorHooks.delete(id); }
};
globalThis.ui = { notifications: { error: text => errors.push(text), warn: text => notices.push(text), info: text => notices.push(text) } };

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

test("les commandes Copier/Coller sont en haut des Traits et absentes des autres éditeurs", async () => {
    for (const type of ["trait", "aptitude", "character"]) {
        const { dialog } = await fixture(type);
        const html = dialog.root.innerHTML;
        if (type === "trait") {
            assert.match(html, /data-trait-clipboard="copy"/);
            assert.match(html, /data-trait-clipboard="paste"/);
            assert.ok(html.indexOf("aa-trait-clipboard") < html.indexOf("aa-effect-tabs"));
        } else assert.doesNotMatch(html, /data-trait-clipboard/);
    }
});

test("copier le brouillon puis coller remplace toute la configuration seulement à l’enregistrement", async () => {
    const source = await fixture();
    change(source.dialog, null, { draft: "name" }, "Trait modèle");
    change(source.dialog, null, { draft: "description" }, "Description copiée");
    change(source.dialog, null, { draft: "requirements" }, "Précisions copiées");
    change(source.dialog, null, { draft: "conditionMatch" }, "any");
    change(source.dialog, "first", { efield: "activationMode" }, "conditions");
    change(source.dialog, "first", { ruleConditionId: "ready" }, true, true);
    change(source.dialog, "first", { efield: "conditionMatch" }, "any");
    change(source.dialog, "first", { efield: "amount" }, "max(@abilities.dexterity.modifier, @abilities.constitution.modifier)");
    await click(source.dialog, { removeEffect: "second" });
    await click(source.dialog, { removeCondition: "weather" });
    await click(source.dialog, { traitClipboard: "copy" });
    change(source.dialog, "first", { efield: "amount" }, "99");
    assert.equal(source.writes.length, 0);
    const target = await fixture();
    const before = { name: target.owner.name, system: structuredClone(target.owner.system) };
    await click(target.dialog, { traitClipboard: "paste" });
    assert.deepEqual(errors, []);
    assert.equal(target.writes.length, 0);
    assert.equal(target.owner.name, before.name);
    assert.deepEqual(target.owner.system, before.system);
    await click(target.dialog, { effectTab: "identity" });
    assert.match(target.dialog.root.innerHTML, /value="Trait modèle"/);
    assert.match(target.dialog.root.innerHTML, /Description copiée/);
    await save(target.dialog);
    assert.deepEqual(errors, []);
    const update = target.writes[0];
    assert.equal(update.name, "Trait modèle");
    assert.equal(update["system.description"], "Description copiée");
    assert.equal(update["system.requirements"], "Précisions copiées");
    assert.equal(update["system.conditionMatch"], "any");
    assert.deepEqual(update["system.effectRules"].first.conditionIds, ["ready"]);
    assert.equal(update["system.effectRules"].first.conditionMatch, "any");
    assert.match(update["system.effectRules"].first.amountFormula, /^max\(@abilities/);
    assert.ok(update["system.effectRules"].second instanceof foundry.data.operators.ForcedDeletion);
    assert.ok(update["system.conditions"].weather instanceof foundry.data.operators.ForcedDeletion);
    assert.equal(update["system.conditions"].ready.label, "Prêt <ici>");
});

test("Annuler après un collage ne modifie aucun Trait", async () => {
    const source = await fixture();
    await click(source.dialog, { traitClipboard: "copy" });
    const target = await fixture();
    const before = structuredClone(target.owner.system);
    await click(target.dialog, { traitClipboard: "paste" });
    await target.dialog.config.buttons.find(button => button.action === "cancel").callback(null, null, target.dialog);
    assert.equal(target.writes.length, 0);
    assert.deepEqual(target.owner.system, before);
});

test("un collage refusé conserve le brouillon existant", async () => {
    const { dialog, writes } = await fixture();
    const before = dialog.root.innerHTML, original = traitParameterClipboard.paste;
    traitParameterClipboard.paste = async () => { throw Error("Paramètres de Trait invalides"); };
    try {
        await click(dialog, { traitClipboard: "paste" });
        assert.match(errors[0], /Paramètres de Trait invalides/);
        assert.equal(dialog.root.innerHTML, before);
        assert.equal(writes.length, 0);
    } finally { traitParameterClipboard.paste = original; }
});

for (const type of ["trait", "aptitude"]) {
    test(`l’éditeur d’un ${type} enregistre plusieurs conditions et une combinaison propre à chaque effet`, async () => {
        const { owner, dialog, writes } = await fixture(type);
        const before = structuredClone(owner.system);
        change(dialog, "first", { efield: "activationMode" }, "conditions");
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
    change(dialog, "first", { efield: "activationMode" }, "conditions");
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
    change(dialog, "first", { efield: "activationMode" }, "conditions");
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
    change(dialog, "first", { efield: "activationMode" }, "conditions");
    change(dialog, "second", { efield: "activationMode" }, "conditions");
    click(dialog, { removeCondition: "ready" });
    click(dialog, { removeCondition: "weather" });
    await save(dialog);
    assert.deepEqual(errors, []);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0]["system.effectRules"].first.conditionIds, []);
    const before = structuredClone(owner.system);
    const another = await openCharacterEffectsEditor(owner, { actor: { system: {}, items: [] } });
    change(another, "first", { efield: "activationMode" }, "conditions");
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
    change(dialog, "second", { efield: "amount" }, "max(@abilities.dexterity.modifier, @abilities.constitution.modifier)");
    click(dialog, { effectTab: "effects" });
    assert.match(dialog.root.innerHTML, /Valeur actuelle : \+4/);
    assert.match(dialog.root.innerHTML, /value="max\(@abilities.dexterity.modifier, @abilities.constitution.modifier\)"/);
    await save(dialog);
    assert.deepEqual(errors, []);
    assert.equal(writes[0]["system.effectRules"].second.amountFormula, "max(@abilities.dexterity.modifier, @abilities.constitution.modifier)");
    assert.deepEqual(actor.system, before);
    const other = await openCharacterEffectsEditor(owner, { actor });
    change(other, "second", { efield: "amount" }, "max(@abilities.dexterity.modifier,)");
    await save(other);
    assert.equal(writes.length, 1);
    assert.ok(errors.length);
});

test("l’onglet Conditions ne contient aucune activation commune et les sélections sont autonomes", async () => {
    const { owner, actor, writes } = await fixture();
    owner.system.effectActivation = { enabled: false, mode: "manual", active: false };
    const dialog = await openCharacterEffectsEditor(owner, { actor });
    click(dialog, { effectTab: "activation" });
    assert.match(dialog.root.innerHTML, />Conditions<\/button>/);
    assert.doesNotMatch(dialog.root.innerHTML, /data-source=|Quand appliquer les effets|Activer les effets de cette source|Combinaison par défaut/);
    click(dialog, { effectTab: "effects" });
    change(dialog, "first", { efield: "activationMode" }, "conditions");
    change(dialog, "first", { ruleConditionId: "ready" }, true, true);
    click(dialog, { effectTab: "preview" });
    assert.match(dialog.root.innerHTML, /Actif —/);
    await save(dialog);
    assert.deepEqual(errors, []);
    assert.equal(writes[0]["system.effectRules"].first.activationMode, "conditions");
    assert.ok(!Object.hasOwn(writes[0], "system.effectActivation"));
    assert.ok(!Object.hasOwn(writes[0], "system.conditionMatch"));
});

test("l’enregistrement reprend les anciens réglages dans chaque effet sans conserver de verrou global", async () => {
    const { owner, actor, writes } = await fixture();
    owner.system.effectActivation = { enabled: true, mode: "manual", active: false };
    for (const rule of Object.values(owner.system.effectRules)) {
        delete rule.activationMode;
        rule.conditionMode = "source";
    }
    const dialog = await openCharacterEffectsEditor(owner, { actor });
    await save(dialog);
    assert.deepEqual(errors, []);
    for (const rule of Object.values(writes[0]["system.effectRules"])) {
        assert.equal(rule.activationMode, "always");
        assert.equal(rule.enabled, false);
    }
    assert.ok(!Object.hasOwn(writes[0], "system.effectActivation"));
    const other = await openCharacterEffectsEditor(owner, { actor });
    change(other, "first", { efield: "enabled" }, true, true);
    await save(other);
    assert.equal(writes[1]["system.effectRules"].first.enabled, true);
    assert.equal(writes[1]["system.effectRules"].first.activationMode, "always");
});

test("le récapitulatif montre les avantages et désavantages de la stance puis se met à jour sans rouvrir", async () => {
    const actor = { uuid: "Actor.hero", name: "Héros", isOwner: true,
        system: { rollMode: "normal", defense: { stance: "dodge" } }, items: [] };
    const beforeHooks = actorHooks.size;
    const dialog = await openCharacterEffectsManager(actor);
    assert.match(dialog.root.innerHTML, /Stance de Défense — Esquive/);
    assert.match(dialog.root.innerHTML, /Jets de sauvegarde · Dextérité · Avantage/);
    assert.match(dialog.root.innerHTML, /Jets de sauvegarde · Constitution · Désavantage/);
    assert.match(dialog.root.innerHTML, /<td>JS de Constitution<\/td><td>—<\/td><td>Oui<\/td><td>Désavantage<\/td>/);
    assert.doesNotMatch(dialog.root.innerHTML, /data-manage-source="undefined"/);
    assert.match(dialog.root.innerHTML, /<td>JS de Dextérité<\/td><td>Oui<\/td>/);
    assert.equal(actorHooks.size, beforeHooks + 1);

    actor.system.defense.stance = "defend";
    for (const { listener } of actorHooks.values()) listener(actor);
    assert.match(dialog.root.innerHTML, /Stance de Défense — Se Défendre/);
    assert.match(dialog.root.innerHTML, /Jets de sauvegarde · Constitution · Avantage/);
    assert.match(dialog.root.innerHTML, /Jets de sauvegarde · Dextérité · Désavantage/);
    assert.match(dialog.root.innerHTML, /<td>JS de Dextérité<\/td><td>—<\/td><td>Oui<\/td><td>Désavantage<\/td>/);
    assert.doesNotMatch(dialog.root.innerHTML, /Stance de Défense — Esquive/);

    actor.system.defense.stance = "none";
    for (const { listener } of actorHooks.values()) listener(actor);
    assert.doesNotMatch(dialog.root.innerHTML, /Stance de Défense —/);
    assert.match(dialog.root.innerHTML, /<td>JS de Constitution<\/td><td>—<\/td>/);
    await dialog.close();
    assert.equal(actorHooks.size, beforeHooks);
});

test("le récapitulatif d'initiative reste neutre sans bonus de jet malgré le mode manuel et les effets", async () => {
    const actor = { uuid: "Actor.hero", name: "Héros", isOwner: true, items: [],
        system: { rollMode: "advantage", effectRules: {
            alert: { ...newEffectRule("roll"), scope: "initiative", amount: 4, advantage: true }
        } } };
    const dialog = await openCharacterEffectsManager(actor);
    assert.match(dialog.root.innerHTML, /<td>Initiative<\/td><td>—<\/td><td>—<\/td><td>Neutre<\/td><td>0<\/td>/);
    await dialog.close();
});
