import test from "node:test";
import assert from "node:assert/strict";
import { fixedEffectAmount, resolveEffectAmount } from "../module/effect-amounts.mjs";
import { activeCharacterEffects, characterEffectSources, effectRuleSummary, newEffectRule, resolveRollEffects } from "../module/character-effects.mjs";

function fixture() {
    return { system: { abilities: { strength: { value: 16, effective: 18, modifier: 4 } },
        consciousness: { value: 12 }, identity: { title: "Capitaine" },
        effectSnapshot: { abilities: { strength: { value: 16, effective: 16, modifier: 3 } } } },
        items: [{ id: "skill123", type: "skill", name: "Discrétion", system: { mastery: 2 } }] };
}

test("fixed numbers and sheet paths, with or without @system, resolve to numeric amounts", () => {
    const actor = fixture(), rule = newEffectRule("roll");
    for (const [amountFormula, expected] of [["16", 16], ["-2", -2],
        ["@abilities.strength.value", 16], ["@system.abilities.strength.modifier", 4],
        ["system.abilities.strength.modifier", 4], ["-@abilities.strength.modifier", -4],
        ["+@consciousness.value", 12], ["@items.skill123.system.mastery", 2]]) {
        assert.deepEqual(resolveEffectAmount(actor, { ...rule, amountFormula }), { value: expected, error: "" });
    }
    assert.equal(fixedEffectAmount("1,5"), 1.5);
    assert.equal(fixedEffectAmount(""), null);
    assert.equal(fixedEffectAmount("Infinity"), null);
});

test("statistical references use the snapshot while roll references read current derived values", () => {
    const actor = fixture();
    for (const kind of ["stat", "roll"]) {
        assert.equal(resolveEffectAmount(actor, { ...newEffectRule(kind), amountFormula: "@abilities.strength.modifier" }).value,
            kind === "stat" ? 3 : 4);
    }
    const stat = { ...newEffectRule(), amountFormula: "@consciousness.value" };
    assert.equal(resolveEffectAmount(actor, stat).value, 12);
});

test("templates can defer reference lookup without accepting invalid syntax or prototype paths", () => {
    const rule = { ...newEffectRule("roll"), amountFormula: "@abilities.strength.modifier" };
    assert.deepEqual(resolveEffectAmount(null, rule, { deferReferences: true }), { value: 0, error: "", pending: true });
    for (const amountFormula of ["alert(1)", "@constructor", "@items.skill123.mastery"]) {
        assert.ok(resolveEffectAmount(null, { ...rule, amountFormula }, { deferReferences: true }).error);
    }
});

test("missing and nonnumeric paths, code, nonfinite values and fractional roll bonuses are rejected", () => {
    const actor = fixture(), rule = newEffectRule("roll");
    const before = structuredClone(actor);
    for (const amountFormula of ["@missing.value", "@identity.title", "@abilities.strength", "@items.foreign.system.mastery",
        "@system.constructor", "@__proto__.polluted", "globalThis.alert(1)", "1d20", "1 + 2", "1e999", "1.5"]) {
        assert.ok(resolveEffectAmount(actor, { ...rule, amountFormula }).error, amountFormula);
    }
    assert.deepEqual(actor, before);
    assert.equal(resolveEffectAmount(actor, { ...newEffectRule(), amountFormula: "1.5" }).value, 1.5);
});

test("resolved effect amounts recalculate and invalid references disable their effect until restored", () => {
    const actor = fixture();
    const source = { id: "trait", type: "trait", name: "Test", system: { effectRules: {
        reference: { ...newEffectRule("roll"), amountFormula: "@abilities.strength.modifier", scope: "save", advantage: true },
        item: { ...newEffectRule("roll"), amountFormula: "-@items.skill123.system.mastery", scope: "save" }
    } } };
    actor.items.push(source);
    assert.equal(resolveRollEffects(activeCharacterEffects(actor), { type: "save" }).bonus, 2);
    actor.system.abilities.strength.modifier = 5;
    actor.items[0].system.mastery = 3;
    assert.equal(resolveRollEffects(activeCharacterEffects(actor), { type: "save" }).bonus, 2);
    actor.items.shift();
    assert.equal(resolveRollEffects(activeCharacterEffects(actor), { type: "save" }).bonus, 5);
    const unavailable = characterEffectSources(actor).find(entry => entry.source.id === "trait").rules.find(rule => rule.id === "item");
    assert.equal(unavailable.active, false);
    assert.match(unavailable.amountError, /introuvable/);
    assert.match(effectRuleSummary(unavailable), /indisponible/);
    actor.items.unshift({ id: "skill123", system: { mastery: 1 } });
    assert.equal(resolveRollEffects(activeCharacterEffects(actor), { type: "save" }).bonus, 4);
    assert.equal(source.system.effectRules.reference.amount, 0);
});
