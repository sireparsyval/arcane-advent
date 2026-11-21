import test from "node:test";
import assert from "node:assert/strict";
import { effectSkillRows } from "../module/effect-skills.mjs";
import { newEffectRule } from "../module/character-effects.mjs";

const rule = values => ({ ...newEffectRule("roll"), scope: "skill", ...values });
const actor = rules => ({ items: [], system: { rollMode: "normal", effectRules: rules,
    abilities: Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
        .map((key, i) => [key, { modifier: i + 1 }])) } });

test("named skill effects create sorted untrained tests without creating Items or masteries", () => {
    const a = actor({ wisdom: rule({ skill: "Arcanisme", ability: "wisdom", disadvantage: true }),
        dex: rule({ skill: "Discrétion", ability: "dexterity", advantage: true, amount: 2 }),
        strengthB: rule({ skill: "Lutte", ability: "strength" }),
        strengthA: rule({ skill: "Athlétisme", ability: "strength" }) });
    const before = structuredClone(a);
    const rows = effectSkillRows(a);
    assert.deepEqual(rows.map(r => [r.abilityLabel, r.name]), [["FOR", "Athlétisme"], ["FOR", "Lutte"], ["DEX", "Discrétion"], ["SAG", "Arcanisme"]]);
    assert.equal(rows[2].totalLabel, "+4");
    assert.equal(rows[2].indicator, "✔️");
    assert.equal(rows[3].indicator, "❌");
    assert.deepEqual(a, before);
});

test("equivalent names merge bonuses and opposed sources cancel, including the manual roll mode", () => {
    const a = actor({ first: rule({ skill: "Discrétion", ability: "dexterity", amount: 3, advantage: true }),
        second: rule({ skill: " discretion ", ability: "dexterity", amount: -1, disadvantage: true }),
        generic: rule({ scope: "all", amount: 2 }) });
    let rows = effectSkillRows(a);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].total, 6);
    assert.equal(rows[0].indicator, "");
    a.system.effectRules.second.enabled = false;
    a.system.rollMode = "disadvantage";
    rows = effectSkillRows(a);
    assert.equal(rows[0].mode, "normal");
    assert.equal(rows[0].total, 7);
});

test("skills already listed under masteries are excluded by ID or normalized name regardless of ability or mastery bonus", () => {
    const a = actor({ id: rule({ skill: "owned", amount: 1 }),
        name: rule({ skill: " DISCRETION ", ability: "strength", amount: 2 }),
        other: rule({ skill: "Athlétisme", ability: "strength" }) });
    a.items.push({ id: "owned", type: "skill", name: "Discrétion", system: { ability: "dexterity", mastery: 20 } });
    assert.deepEqual(effectSkillRows(a).map(row => row.name), ["Athlétisme"]);
    a.items[0].system.mastery = 0;
    assert.deepEqual(effectSkillRows(a).map(row => row.name), ["Athlétisme"]);
});

test("different associated abilities stay distinct and unknown abilities never default to Force", () => {
    const a = actor({ str: rule({ skill: "Impressionner", ability: "strength" }),
        cha: rule({ skill: "Impressionner", ability: "charisma" }),
        missing: rule({ skill: "Navigation", advantage: true }) });
    const rows = effectSkillRows(a);
    assert.deepEqual(rows.map(r => r.ability), ["strength", "charisma", ""]);
    assert.equal(rows[2].canRoll, false);
    assert.equal(rows[2].totalLabel, "—");
    assert.equal(rows[2].abilityLabel, "—");
});

test("only active effects for named skill tests appear and formula bonuses resolve from the actor", () => {
    const a = actor({ unnamed: rule({ ability: "dexterity" }),
        attack: rule({ scope: "attack", skill: "Attaque" }),
        disabled: rule({ skill: "Désactivée", ability: "dexterity", enabled: false }),
        stat: { ...newEffectRule(), skill: "Statistique" } });
    const trait = { id: "trait", name: "Trait", type: "trait", system: {
        conditions: { ready: { kind: "manual", enabled: false } }, effectRules: {
            skill: rule({ skill: "Discrétion", ability: "dexterity", amountFormula: "@abilities.strength.modifier",
                activationMode: "conditions", conditionIds: ["ready"] }) } } };
    a.items.push(trait);
    assert.deepEqual(effectSkillRows(a), []);
    trait.system.conditions.ready.enabled = true;
    assert.equal(effectSkillRows(a)[0].total, 3);
    trait.system.conditions.ready.enabled = false;
    assert.deepEqual(effectSkillRows(a), []);
});
