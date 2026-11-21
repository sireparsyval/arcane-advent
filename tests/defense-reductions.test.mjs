import test from "node:test";
import assert from "node:assert/strict";
import { defenseReductionsByZone, shieldDamageReductions } from "../module/defense-reductions.mjs";
import { activeCharacterEffects, newEffectRule, effectRuleSummary } from "../module/character-effects.mjs";

const protection = (zones, damageReductions, equipped = true) => ({ type: "protection", system: {
    equipped, zones: new Set(zones), damageReductions
} });

test("global and partial effects combine with armor while respecting activation and conditions", () => {
    const rule = changes => ({ ...newEffectRule("reduction"), amount: 3, damageType: "Feu", ...changes });
    const actor = { system: { effectRules: {} }, items: [{ id: "trait", name: "Protection", type: "trait", system: {
        conditions: { c: { kind: "manual", enabled: false } }, effectRules: {
            global: rule({}), partial: rule({ damageZone: "head", amount: 2 }),
            gated: rule({ activationMode: "conditions", conditionIds: ["c"], amount: 10 }),
            disabled: rule({ enabled: false, amount: 100 })
        }
    } }] };
    const equipment = [protection(["head"], { Feu: 1 })];
    let rows = defenseReductionsByZone(equipment, activeCharacterEffects(actor));
    assert.deepEqual(rows.head, [{ label: "Feu", amount: 6 }]);
    assert.deepEqual(rows.torso, [{ label: "Feu", amount: 3 }]);
    actor.items[0].system.conditions.c.enabled = true;
    rows = defenseReductionsByZone(equipment, activeCharacterEffects(actor));
    assert.equal(rows.head[0].amount, 16); assert.equal(rows.legs[0].amount, 13);
    actor.items[0].system.effectRules.global.enabled = false;
    actor.items[0].system.conditions.c.enabled = false;
    rows = defenseReductionsByZone(equipment, activeCharacterEffects(actor));
    assert.deepEqual(rows.head, [{ label: "Feu", amount: 3 }]); assert.deepEqual(rows.torso, []);
});

test("all-type protection and invalid or inactive damage effects stay distinct", () => {
    const rows = defenseReductionsByZone([], [
        { kind: "reduction", amount: 2, damageZone: "all", damageType: "" },
        { kind: "reduction", amount: 3, damageZone: "arms", damageType: "slashing" },
        { kind: "reduction", amount: 50, damageZone: "all", active: false },
        { kind: "reduction", amount: 50, damageZone: "all", amountError: "bad" },
        { kind: "reduction", amount: -1, damageZone: "all" }
    ]);
    assert.deepEqual(rows.head, [{ label: "Tous types", amount: 2 }]);
    assert.deepEqual(rows.arms, [{ label: "Tous types", amount: 2 }, { label: "Tranchants", amount: 3 }]);
    assert.match(effectRuleSummary({ kind: "reduction", amount: 2, damageZone: "arms", damageType: "Feu" }), /Feu.*−2 Dgts.*Bras/);
});

test("resistances keep the strongest percentage per type and zone without mixing with flat reductions", () => {
    const rule = changes => ({ ...newEffectRule("resistance"), amount: 25, damageType: "Feu", ...changes });
    const actor = { system: { effectRules: { first: rule({}), second: rule({ amount: 50, damageType: " feu " }),
        partial: rule({ amount: 75, damageZone: "head" }), off: rule({ enabled: false, amount: 100 }),
        invalid: rule({ amount: 101 }) } }, items: [] };
    const armor = [protection(["head"], { Feu: 3 })];
    const rows = defenseReductionsByZone(armor, activeCharacterEffects(actor));
    assert.deepEqual(rows.head, [{ label: "Feu", amount: 3 }, { label: "Feu", amount: 75, percent: true }]);
    assert.deepEqual(rows.torso, [{ label: "Feu", amount: 50, percent: true }]);
    assert.deepEqual(rows.legs, rows.torso);
    assert.match(effectRuleSummary(rule({ amount: 50 })), /Résistance.*Feu.*50 %.*Globale/);
});

test("percentage aliases combine, invalid zones and values do not create defense entries", () => {
    const rows = defenseReductionsByZone([], [
        { kind: "resistance", damageZone: "arms", damageType: "slashing", amount: 30 },
        { kind: "resistance", damageZone: "arms", damageType: "Tranchants", amount: 60 },
        { kind: "resistance", damageZone: "other", amount: 100 },
        { kind: "resistance", damageZone: "all", amount: NaN },
        { kind: "resistance", damageZone: "all", amount: -10 },
        { kind: "resistance", damageZone: "all", amount: 200 }
    ]);
    assert.deepEqual(rows.head, []);
    assert.deepEqual(rows.arms, [{ label: "Tranchants", amount: 60, percent: true }]);
});

test("only equipped protections covering the selected zone contribute", () => {
    const rows = defenseReductionsByZone([
        protection(["torso"], { Tranchants: 1, Contondants: 2 }),
        protection(["arms"], { Tranchants: 3 }),
        protection(["legs"], { Perforants: 1 }),
        protection(["torso"], { Feu: 10 }, false),
        { type: "shield", system: { equipped: true, damageReductions: { Tranchants: 10 } } },
        { type: "weapon", system: { equipped: true, zones: ["torso"], damageReductions: { Feu: 10 } } }
    ]);
    assert.deepEqual(rows.head, []);
    assert.deepEqual(rows.torso, [{ label: "Tranchants", amount: 1 }, { label: "Contondants", amount: 2 }]);
    assert.deepEqual(rows.arms, [{ label: "Tranchants", amount: 3 }]);
    assert.deepEqual(rows.legs, [{ label: "Perforants", amount: 1 }]);
});

test("overlapping protections add their reductions once per zone and damage type", () => {
    const rows = defenseReductionsByZone([
        protection(["torso", "arms"], { Tranchants: 1 }),
        protection(["torso"], { Tranchants: 2, Feu: 3 }),
        protection(["arms"], { Feu: 1 })
    ]);
    assert.deepEqual(rows.torso, [{ label: "Tranchants", amount: 3 }, { label: "Feu", amount: 3 }]);
    assert.deepEqual(rows.arms, [{ label: "Tranchants", amount: 1 }, { label: "Feu", amount: 1 }]);
});

test("French names, English physical IDs and letter case combine without duplicate rows", () => {
    const rows = defenseReductionsByZone([
        protection(["torso"], { slashing: 1, bludgeoning: 1, piercing: 1, Feu: 1 }),
        protection(["torso"], { " tranchants ": 2, Contondant: 2, Perforants: 2, " FEU ": 2 })
    ]);
    assert.deepEqual(rows.torso, [
        { label: "Tranchants", amount: 3 }, { label: "Contondants", amount: 3 },
        { label: "Perforants", amount: 3 }, { label: "Feu", amount: 3 }
    ]);
});

test("zero, negative, nonfinite and blank-name reductions are absent", () => {
    const rows = defenseReductionsByZone([
        protection(["head"], { Feu: 0, Froid: -1, Acide: NaN, Poison: Infinity, " ": 5, Radiant: "2" })
    ]);
    assert.deepEqual(rows.head, [{ label: "Radiant", amount: 2 }]);
});

test("legacy zone arrays do not count duplicate entries twice and do not mutate source", () => {
    const item = { type: "protection", system: { equipped: true, zones: ["torso", "torso", "unknown"], damageReductions: { Feu: 2 } } };
    const before = structuredClone(item);
    assert.deepEqual(defenseReductionsByZone([item]).torso, [{ label: "Feu", amount: 2 }]);
    assert.deepEqual(item, before);
});

test("changing equipped state or covered zones immediately changes the displayed totals", () => {
    const item = protection(["torso"], { Feu: 2 });
    assert.equal(defenseReductionsByZone([item]).torso[0].amount, 2);
    item.system.zones = new Set(["arms"]);
    assert.deepEqual(defenseReductionsByZone([item]).torso, []);
    assert.equal(defenseReductionsByZone([item]).arms[0].amount, 2);
    item.system.equipped = false;
    assert.deepEqual(defenseReductionsByZone([item]).arms, []);
});

test("shield reductions include only equipped shields and remain separate from zone armor", () => {
    const items = [
        { type: "shield", system: { equipped: true, guardEnabled: false, damageReductions: { Tranchants: 2, Perforants: 2, Contondants: 1 } } },
        { type: "shield", system: { equipped: false, damageReductions: { Feu: 99 } } },
        protection(["torso"], { Tranchants: 1, Feu: 3 }),
        { type: "weapon", system: { equipped: true, damageReductions: { Froid: 5 } } }
    ];
    assert.deepEqual(shieldDamageReductions(items), [
        { label: "Tranchants", amount: 2 }, { label: "Perforants", amount: 2 }, { label: "Contondants", amount: 1 }
    ]);
    assert.deepEqual(defenseReductionsByZone(items).torso, [{ label: "Tranchants", amount: 1 }, { label: "Feu", amount: 3 }]);
});

test("multiple shields combine normalized damage types and ignore empty or invalid reductions", () => {
    const items = [
        { type: "shield", system: { equipped: true, damageReductions: { slashing: 1, Feu: 2, Froid: 0, " ": 3 } } },
        { type: "shield", system: { equipped: true, damageReductions: { " TRANCHANTS ": 2, " feu ": 1, Acide: -1, Poison: Infinity } } }
    ];
    const before = structuredClone(items);
    assert.deepEqual(shieldDamageReductions(items), [{ label: "Tranchants", amount: 3 }, { label: "Feu", amount: 3 }]);
    assert.deepEqual(items, before);
});

test("shield reductions refresh after editing or unequipping a shield", () => {
    const shield = { type: "shield", system: { equipped: true, damageReductions: { Feu: 2 } } };
    assert.deepEqual(shieldDamageReductions([shield]), [{ label: "Feu", amount: 2 }]);
    shield.system.damageReductions.Feu = 4;
    assert.deepEqual(shieldDamageReductions([shield]), [{ label: "Feu", amount: 4 }]);
    shield.system.equipped = false;
    assert.deepEqual(shieldDamageReductions([shield]), []);
    assert.deepEqual(shieldDamageReductions([]), []);
});
