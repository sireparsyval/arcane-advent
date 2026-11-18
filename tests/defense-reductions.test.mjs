import test from "node:test";
import assert from "node:assert/strict";
import { defenseReductionsByZone, shieldDamageReductions } from "../module/defense-reductions.mjs";

const protection = (zones, damageReductions, equipped = true) => ({ type: "protection", system: {
    equipped, zones: new Set(zones), damageReductions
} });

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
