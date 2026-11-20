import test from "node:test";
import assert from "node:assert/strict";
import { activeCharacterEffects, applyStatisticEffects, effectRuleSummary, newEffectRule, resolveRollEffects } from "../module/character-effects.mjs";
import { conditionMetricValue, aptitudeConditionStatus, conditionSummary } from "../module/aptitude-conditions.mjs";

const roll = changes => ({ ...newEffectRule("roll"), activationMode: "legacy", conditionMode: "source", ...changes });
const stat = changes => ({ ...newEffectRule(), activationMode: "legacy", conditionMode: "source", ...changes });
const item = (id, type, rules, system = {}) => ({ id, name: id, type, system: { effectRules: rules, ...system } });

test("advantages are boolean sources: three advantages and one disadvantage cancel", () => {
    const rules = [roll({ advantage: true }), roll({ advantage: true }), roll({ advantage: true }), roll({ disadvantage: true })];
    assert.equal(resolveRollEffects(rules, { type: "ability" }).mode, "normal");
    assert.equal(resolveRollEffects([roll({ advantage: true })], { type: "save" }, "disadvantage").mode, "normal");
    assert.equal(resolveRollEffects([roll({ disadvantage: true })], { type: "skill" }, "advantage").mode, "normal");
    assert.equal(resolveRollEffects([roll({ advantage: true, disadvantage: true })], { type: "attack" }).mode, "normal");
    assert.equal(resolveRollEffects([roll({ advantage: true })], { type: "ability" }, "normal").mode, "advantage");
});

test("roll effects select scope, associated ability and skill without leaking to another roll", () => {
    const rules = [roll({ scope: "skill", ability: "dexterity", skill: "Discrétion", advantage: true, amount: 2 })];
    assert.equal(resolveRollEffects(rules, { type: "skill", ability: "dexterity", skillName: "discretion" }).bonus, 2);
    assert.equal(resolveRollEffects(rules, { type: "save", ability: "dexterity" }).mode, "normal");
    assert.equal(resolveRollEffects(rules, { type: "skill", ability: "strength", skillName: "Discrétion" }).bonus, 0);
    assert.equal(resolveRollEffects([roll({ scope: "save", disadvantage: true })], { type: "guard" }).mode, "disadvantage");
    assert.equal(resolveRollEffects([roll({ scope: "ability", advantage: true })], { type: "initiative", ability: "dexterity" }).mode, "advantage");
});

test("fixed additions before or after multiplication are deterministic and preserve zero coefficients", () => {
    assert.equal(applyStatisticEffects(50, "carryingCapacity", [stat({ target: "carryingCapacity", amount: 10, coefficient: 2, addBefore: true })], { integer: false }), 120);
    assert.equal(applyStatisticEffects(50, "carryingCapacity", [stat({ target: "carryingCapacity", amount: 10, coefficient: 2, addBefore: false })]), 110);
    const rules = [stat({ amount: 4, coefficient: 2, addBefore: true }), stat({ amount: -3, coefficient: 1.5 })];
    assert.equal(applyStatisticEffects(10, "strength", rules), 39);
    assert.equal(applyStatisticEffects(10, "strength", rules.toReversed()), 39);
    assert.equal(applyStatisticEffects(10, "strength", [stat({ amount: 2, coefficient: 0 })]), 2);
});

test("Trait, passive, manual and duration activations contribute only while active", () => {
    const actor = { system: {}, items: [
        item("trait", "trait", { t: roll({ advantage: true }) }),
        item("passif", "aptitude", { p: roll({ amount: 2 }) }, { category: "passive" }),
        item("actif", "aptitude", { a: roll({ amount: 99 }) }, { category: "technique" }),
        item("posture", "aptitude", { m: roll({ disadvantage: true }) }, { effectActivation: { mode: "manual", active: false } }),
        item("durée", "aptitude", { d: roll({ amount: 3 }) }, { effectActivation: { mode: "duration" }, effectDuration: { enabled: true, remaining: 1 } })
    ] };
    let effects = activeCharacterEffects(actor);
    assert.equal(effects.length, 3);
    assert.equal(resolveRollEffects(effects, { type: "save" }).bonus, 5);
    actor.items[3].system.effectActivation.active = true;
    actor.items[4].system.effectDuration.remaining = 0;
    effects = activeCharacterEffects(actor);
    assert.equal(resolveRollEffects(effects, { type: "save" }).mode, "normal");
    assert.equal(resolveRollEffects(effects, { type: "save" }).bonus, 2);
});

test("presence criteria use actual items and never accept meaningless numeric comparisons", () => {
    const actor = { system: { defense: { base: 12, zones: { torso: 15 } }, encumbrance: { carried: 20, maximum: 50, percentage: 40 } },
        items: [{ id: "armor", name: "Cuirasse", type: "protection", system: { equipped: true, armorClass: "Lourde" } }] };
    const condition = { kind: "automatic", metric: "equipped", key: "armor", value: 1, operator: "=" };
    assert.equal(aptitudeConditionStatus(actor, condition), true);
    assert.match(conditionSummary(actor, condition), /Cuirasse.*oui/);
    assert.equal(aptitudeConditionStatus(actor, { ...condition, operator: "<=", value: 50 }), false);
    assert.equal(conditionMetricValue(actor, { metric: "defense", key: "torso" }), 15);
    assert.equal(aptitudeConditionStatus(actor, { kind: "automatic", metric: "encumbrance", key: "percentage", operator: "<=", value: 40 }), true);
});

globalThis.foundry = { abstract: { TypeDataModel: class { prepareDerivedData() {} } }, data: { fields: {} } };
const { CharacterData } = await import("../module/data/character-data.mjs");
function character(items = [], rules = {}) {
    const abilities = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map(key => [key, { value: 10 }]));
    const model = Object.assign(Object.create(CharacterData.prototype), {
        effectRules: rules, effectActivation: { mode: "always", enabled: true }, conditions: {},
        abilities, modifierTotals: {}, manualModifiers: {}, identity: { volume: "medium" },
        carryingCapacityBonusKg: 10, carryingCapacityCoefficient: 2, carryingCapacityAddBefore: false,
        savingThrows: Object.fromEntries(Object.keys(abilities).map(key => [key, { mastery: 0 }])),
        defense: { mode: "dex", zones: {} }, trackers: { speed: 9 }, encumbrance: {},
        consciousness: { value: 15, max: 20 }, fever: { value: 6, max: 6 }, consciousnessDice: { value: 2, max: 3 },
        barrier: 0, mercy: 0, deathSaves: { successes: 0, failures: 0 }
    });
    model.parent = { system: model, items, getExpertiseBonus: () => 0 };
    return model;
}

test("derived effects update abilities and dependent statistics, zones and maxima without changing stored bases", () => {
    const model = character([item("robuste", "trait", {
        str: stat({ target: "strength", amount: 2 }), torso: stat({ target: "defenseTorso", amount: 3 }),
        max: stat({ target: "consciousnessMax", amount: 5 })
    })]);
    model.prepareDerivedData();
    assert.equal(model.abilities.strength.value, 10);
    assert.equal(model.abilities.strength.effective, 12);
    assert.equal(model.abilities.strength.modifier, 1);
    assert.equal(model.encumbrance.maximum, 130);
    assert.equal(model.defense.base, 10);
    assert.equal(model.defense.zones.torso, 13);
    assert.equal(model.defense.zones.head, 10);
    assert.equal(model.consciousness.max, 20);
    assert.equal(model.consciousness.effectiveMax, 25);
    assert.equal(model.consciousness.value, 15);
    model.prepareDerivedData();
    assert.equal(model.encumbrance.maximum, 130);
    assert.equal(model.consciousness.effectiveMax, 25);
    model.parent.items = [];
    model.prepareDerivedData();
    assert.equal(model.abilities.strength.effective, 10);
    assert.equal(model.defense.zones.torso, 10);
    assert.equal(model.consciousness.effectiveMax, 20);
});

test("automatic effects inspect baseline values and cannot oscillate on their own bonus", () => {
    const source = item("conditionnel", "trait", { str: stat({ amount: 4 }) }, {
        effectActivation: { mode: "conditions" }, conditions: { low: { kind: "automatic", metric: "ability", key: "strength", operator: "<", value: 12 } }
    });
    const model = character([source]);
    for (let i = 0; i < 4; i++) {
        model.prepareDerivedData();
        assert.equal(model.abilities.strength.effective, 14);
        assert.equal(model.effectSnapshot.abilities.strength.effective, 10);
    }
    model.abilities.strength.value = 13;
    model.prepareDerivedData();
    assert.equal(model.abilities.strength.effective, 13);
});

test("compact skill summaries omit redundant scope while keeping ambiguous roll types explicit", () => {
    const rule = roll({ scope: "skill", ability: "dexterity", skill: "Discrétion", advantage: true });
    assert.equal(effectRuleSummary(rule, { compact: true }), "Dextérité · Discrétion · Avantage");
    assert.equal(effectRuleSummary(rule), "Tests de compétence · Dextérité · Discrétion · Avantage");
    assert.equal(effectRuleSummary({ ...rule, skill: "" }, { compact: true }), "Tests de compétence · Dextérité · Avantage");
    assert.equal(effectRuleSummary({ ...rule, scope: "save", skill: "" }, { compact: true }), "Jets de sauvegarde · Dextérité · Avantage");
});

test("selected automatic conditions inspect the baseline and update statistics independently", () => {
    const source = item("indépendant", "trait", {
        strength: stat({ amount: 4, conditionMode: "selected", conditionIds: ["weak"], conditionMatch: "all" }),
        speed: stat({ target: "speed", amount: 3, conditionMode: "selected", conditionIds: ["ready"], conditionMatch: "all" })
    }, { effectActivation: { mode: "conditions" }, conditionMatch: "all", conditions: {
        weak: { kind: "automatic", metric: "ability", key: "strength", operator: "<", value: 12 },
        ready: { kind: "manual", enabled: false }
    } });
    const model = character([source]);
    for (let i = 0; i < 3; i++) {
        model.prepareDerivedData();
        assert.equal(model.abilities.strength.effective, 14);
        assert.equal(model.trackers.effectiveSpeed, 9);
    }
    source.system.conditions.ready.enabled = true;
    model.abilities.strength.value = 13;
    model.prepareDerivedData();
    assert.equal(model.abilities.strength.effective, 13);
    assert.equal(model.trackers.effectiveSpeed, 12);
});

test("numeric references feed statistics without feedback and rolls use the resulting modifier", () => {
    const source = item("référence", "trait", {
        strength: stat({ amountFormula: "@abilities.strength.modifier" }),
        roll: roll({ scope: "save", amountFormula: "@abilities.strength.modifier" })
    });
    const model = character([source]);
    model.abilities.strength.value = 16;
    for (let i = 0; i < 4; i++) {
        model.prepareDerivedData();
        assert.equal(model.abilities.strength.effective, 19);
        assert.equal(resolveRollEffects(activeCharacterEffects(model.parent), { type: "save" }).bonus, 4);
    }
    model.abilities.strength.value = 18;
    model.prepareDerivedData();
    assert.equal(model.abilities.strength.effective, 22);
    assert.equal(resolveRollEffects(activeCharacterEffects(model.parent), { type: "save" }).bonus, 6);
    assert.equal(source.system.effectRules.strength.amount, 0);
    assert.equal(source.system.effectRules.strength.amountFormula, "@abilities.strength.modifier");
});

test("formula functions retain statistical baselines while roll bonuses use updated modifiers", () => {
    const source = item("formules", "trait", {
        dex: stat({ target: "dexterity", amount: 4 }),
        strength: stat({ amountFormula: "max(@abilities.dexterity.modifier, @abilities.constitution.modifier)" }),
        bonus: roll({ scope: "save", amountFormula: "max(@abilities.dexterity.modifier, @abilities.constitution.modifier)" })
    });
    const model = character([source]);
    model.abilities.strength.value = 16;
    model.abilities.dexterity.value = 14;
    model.abilities.constitution.value = 16;
    for (let i = 0; i < 3; i++) {
        model.prepareDerivedData();
        assert.equal(model.abilities.strength.effective, 19);
        assert.equal(model.abilities.dexterity.effective, 18);
        assert.equal(resolveRollEffects(activeCharacterEffects(model.parent), { type: "save" }).bonus, 4);
    }
    assert.equal(source.system.effectRules.strength.amountFormula, "max(@abilities.dexterity.modifier, @abilities.constitution.modifier)");
});

test("les stances appliquent les avantages et désavantages croisés aux seuls JS concernés", () => {
    const actor = { system: { defense: { stance: "none" } }, items: [] };
    for (const [stance, ability] of [["dodge", "dexterity"], ["defend", "constitution"]]) {
        actor.system.defense.stance = stance;
        const effects = activeCharacterEffects(actor);
        assert.equal(resolveRollEffects(effects, { type: "save", ability }).mode, "advantage");
        assert.equal(resolveRollEffects(effects, { type: "save", ability }, "disadvantage").mode, "normal");
        assert.equal(resolveRollEffects(effects, { type: "save", ability: "strength" }).mode, "normal");
        assert.equal(resolveRollEffects(effects, { type: "ability", ability }).mode, "normal");
        assert.equal(resolveRollEffects(effects, { type: "attack", ability }).mode, "normal");
        assert.equal(resolveRollEffects(effects, { type: "guard", ability: "strength" }).mode, "normal");
        const otherAbility = ability === "dexterity" ? "constitution" : "dexterity";
        assert.equal(resolveRollEffects(effects, { type: "save", ability: otherAbility }).mode, "disadvantage");
        assert.equal(resolveRollEffects(effects, { type: "save", ability: otherAbility }, "advantage").mode, "normal");
        assert.equal(resolveRollEffects(effects, { type: "ability", ability: otherAbility }).mode, "normal");
    }
    actor.system.defense.stance = "none";
    assert.equal(activeCharacterEffects(actor).length, 0);
});

test("les stances conservent les Défenses habituelles et partielles à côté de la Garde", () => {
    const model = character([
        { type: "shield", system: { equipped: true, guardEnabled: true, defenseBonus: 2 } },
        { type: "protection", system: { equipped: true, zones: ["torso"], defenseBonus: 3 } }
    ]);
    model.abilities.dexterity.value = 14;
    for (const stance of ["none", "dodge", "defend", "none"]) {
        model.defense.stance = stance;
        model.prepareDerivedData();
        assert.equal(model.defense.base, 14);
        assert.deepEqual(model.defense.zones, { head: 14, torso: 17, arms: 14, legs: 14 });
    }
});
