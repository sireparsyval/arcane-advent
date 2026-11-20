import test from "node:test";
import assert from "node:assert/strict";
import { guardValues } from "../module/guard.mjs";

const weapon = (options = {}) => ({
    type: "weapon",
    system: { equipped: true, properties: new Set(["guard", "twoHanded"]), ...options }
});
const shield = (options = {}) => ({
    type: "shield",
    system: { equipped: true, guardEnabled: true, defenseBonus: 2, ...options }
});
const calculate = (item, strengthModifier = 2, dexterityModifier = -1, expertiseBonus = 2, constitutionModifier = 0) =>
    guardValues(item, { strengthModifier, dexterityModifier, constitutionModifier, expertiseBonus });

test("Espadon FOR 14 / DEX 8 / expertise 2 : Défense 13 et JS +3", () => {
    assert.deepEqual(calculate(weapon()), { defense: 13, savingThrowModifier: 3 });
});

test("Scutum FOR 14 / DEF +2 / expertise 3 : Défense 17 et JS +7", () => {
    assert.deepEqual(calculate(shield(), 2, -1, 3), { defense: 17, savingThrowModifier: 7 });
});

test("la DEX positive augmente la Garde d'une arme", () => {
    assert.deepEqual(calculate(weapon(), 2, 4, 2), { defense: 18, savingThrowModifier: 8 });
});

test("la DEX négative pénalise la Garde d'arme uniquement", () => {
    assert.deepEqual(calculate(weapon(), 1, -3, 2), { defense: 10, savingThrowModifier: 0 });
    assert.deepEqual(calculate(shield(), 1, -3, 2), { defense: 15, savingThrowModifier: 5 });
});

test("la CON négative pénalise uniquement la Garde au bouclier", () => {
    assert.deepEqual(calculate(shield(), 2, -1, 3, -2), { defense: 15, savingThrowModifier: 5 });
    assert.deepEqual(calculate(weapon(), 2, -1, 2, -2), { defense: 13, savingThrowModifier: 3 });
});

test("la CON positive augmente la Garde au bouclier", () => {
    assert.deepEqual(calculate(shield(), 2, -1, 3, 4), { defense: 21, savingThrowModifier: 11 });
});

test("le JS et la Défense gardent toujours un écart de 10, même avec un malus", () => {
    const result = calculate(weapon(), -2, -3, 0);
    assert.deepEqual(result, { defense: 5, savingThrowModifier: -5 });
    assert.equal(result.defense - result.savingThrowModifier, 10);
});

test("Garde fonctionne sans Deux mains et sans l'ancien indicateur", () => {
    for (const properties of [new Set(["guard"]), ["guard"]]) {
        assert.deepEqual(calculate(weapon({ properties, guardEnabled: false })),
            { defense: 13, savingThrowModifier: 3 });
    }
});

test("Deux mains seul et l'ancien indicateur seuls ne donnent pas la Garde", () => {
    assert.equal(calculate(weapon({ properties: new Set(["twoHanded"]), guardEnabled: true })), null);
    assert.equal(calculate(weapon({ properties: [], guardEnabled: true })), null);
});

test("une garde indisponible ne s'affiche pas et ne peut pas être lancée", () => {
    assert.equal(calculate(weapon({ equipped: false })), null);
    assert.equal(calculate(weapon({ properties: new Set() })), null);
    assert.equal(calculate(shield({ equipped: false })), null);
    assert.equal(calculate(shield({ guardEnabled: false })), null);
    assert.equal(calculate(null), null);
});
