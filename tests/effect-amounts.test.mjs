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
        "@system.constructor", "@__proto__.polluted", "globalThis.alert(1)", "1d20", "1 ** 2", "1e999", "1.5"]) {
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

test("max/min and modifier aliases select the intended value and compose with arithmetic", () => {
    const actor = fixture();
    Object.assign(actor.system.abilities, { dexterity: { modifier: 2 }, constitution: { modifier: 4 },
        intelligence: { modifier: -1 }, wisdom: { modifier: 0 }, charisma: { modifier: -3 } });
    const rule = newEffectRule("roll");
    for (const [amountFormula, expected] of [
        ["max(mod.dex, mod.con)", 4], ["min(mod.dex, mod.con)", 2],
        ["max(-2, -4)", -2], ["max(mod.dex, @abilities.constitution.modifier) + 2", 6],
        ["max(mod.for, mod.int, mod.sag, mod.cha)", 4],
        ["-max(mod.dex, mod.con)", -4], ["min(0, mod.cha)", -3],
        ["abs(mod.cha)", 3], ["floor(5 / 2)", 2], ["ceil(5 / 2)", 3], ["round(2.4)", 2],
        ["max(min(7, 3), abs(-5))", 5], ["1+2*3", 7], ["(1+2)*3", 9],
        ["10-3-2", 5], ["8/2/2", 2], ["-2*-3", 6], ["mod.con-mod.dex", 2],
        ["max(1, 2, 3)", 3], ["max(1; 2)", 2]
    ]) {
        assert.deepEqual(resolveEffectAmount(actor, { ...rule, amountFormula }), { value: expected, error: "" }, amountFormula);
    }
    actor.system.abilities.dexterity.modifier = 6;
    assert.equal(resolveEffectAmount(actor, { ...rule, amountFormula: "max(mod.dex, mod.con)" }).value, 6);
});

test("functions accept owned Item references with hyphenated IDs without confusing subtraction", () => {
    const actor = fixture();
    actor.items.push({ id: "item-with-dashes", system: { level: 8 } });
    const rule = { ...newEffectRule("roll"), amountFormula: "max(@items.item-with-dashes.system.level, 4)-1" };
    assert.deepEqual(resolveEffectAmount(actor, rule), { value: 7, error: "" });
});

test("formula validation rejects malformed calls, division by zero, excessive nesting and code", () => {
    const actor = fixture(), rule = newEffectRule("roll"), before = structuredClone(actor);
    for (const amountFormula of [
        "max()", "abs(1,2)", "max(1,)", "max(1,2", "max(1,2))", "max(1,missing.value)",
        "Math.max(1,2)", "constructor(1)", "max(1, @__proto__.value)", "mod.unknown",
        "1/0", "1e308*1e308", "2 ** 3", "max(1,2);alert(1)", "(()=>2)()", "1d20",
        "(".repeat(40) + "1" + ")".repeat(40), "1+".repeat(110) + "1", "max(" + "1,".repeat(260) + "1)"
    ]) {
        assert.ok(resolveEffectAmount(actor, { ...rule, amountFormula }).error, amountFormula);
    }
    assert.deepEqual(actor, before);
    assert.match(resolveEffectAmount(actor, { ...rule, amountFormula: "max(1.5, 1)" }).error, /entier/);
});

test("deferred template formulas still validate syntax while preserving unknown operands", () => {
    const rule = newEffectRule("roll");
    for (const amountFormula of ["max(mod.dex, mod.con)", "10 / (mod.dex - mod.con)"]) {
        assert.deepEqual(resolveEffectAmount(null, { ...rule, amountFormula }, { deferReferences: true }),
            { value: 0, error: "", pending: true });
    }
    assert.deepEqual(resolveEffectAmount(null, { ...rule, amountFormula: "floor(5 / 2)" }, { deferReferences: true }),
        { value: 2, error: "" });
    for (const amountFormula of ["max(mod.dex,)", "mod.dex/0", "Math.max(mod.dex, 2)"]) {
        assert.ok(resolveEffectAmount(null, { ...rule, amountFormula }, { deferReferences: true }).error);
    }
});
