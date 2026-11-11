import test from "node:test";
import assert from "node:assert/strict";
import { guardValues } from "../module/guard.mjs";

const twoHanded = (options = {}) => ({
    type: "weapon",
    system: { equipped: true, guardEnabled: true, properties: new Set(["twoHanded"]), ...options }
});
const shield = (options = {}) => ({
    type: "shield",
    system: { equipped: true, guardEnabled: true, defenseBonus: 2, ...options }
});
const calculate = (item, strengthModifier = 2, dexterityModifier = -1, expertiseBonus = 2) =>
    guardValues(item, { strengthModifier, dexterityModifier, expertiseBonus });

test("Espadon FOR 14 / DEX 8 / expertise 2 : Défense 13 et JS +3", () => {
    assert.deepEqual(calculate(twoHanded()), { defense: 13, savingThrowModifier: 3 });
});

test("Scutum FOR 14 / DEF +2 / expertise 3 : Défense 17 et JS +7", () => {
    assert.deepEqual(calculate(shield(), 2, -1, 3), { defense: 17, savingThrowModifier: 7 });
});

test("la DEX positive n'augmente jamais la Garde d'une arme", () => {
    assert.deepEqual(calculate(twoHanded(), 2, 4, 2), { defense: 14, savingThrowModifier: 4 });
});

test("la DEX négative pénalise la Garde d'une arme, pas celle d'un bouclier", () => {
    assert.deepEqual(calculate(twoHanded(), 1, -3, 2), { defense: 10, savingThrowModifier: 0 });
    assert.deepEqual(calculate(shield(), 1, -3, 2), { defense: 15, savingThrowModifier: 5 });
});

test("le JS et la Défense gardent toujours un écart de 10, même avec un malus", () => {
    const result = calculate(twoHanded(), -2, -3, 0);
    assert.deepEqual(result, { defense: 5, savingThrowModifier: -5 });
    assert.equal(result.defense - result.savingThrowModifier, 10);
});

test("une garde indisponible ne s'affiche pas et ne peut pas être lancée", () => {
    assert.equal(calculate(twoHanded({ equipped: false })), null);
    assert.equal(calculate(twoHanded({ guardEnabled: false })), null);
    assert.equal(calculate({ type: "weapon", system: { equipped: true, guardEnabled: true, properties: new Set() } }), null);
    assert.equal(calculate(shield({ equipped: false })), null);
    assert.equal(calculate(null), null);
});
