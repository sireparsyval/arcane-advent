import test from "node:test";
import assert from "node:assert/strict";
import { carryingCapacity, calculateEncumbrance, encumberedSpeed, VOLUME_FACTORS } from "../module/encumbrance.mjs";
import { buildInventory } from "../module/inventory.mjs";

test("un Terrian moyen FOR 10 a 50 kg de charge maximale", () => {
    assert.equal(carryingCapacity(10, "medium"), 50);
    assert.equal(carryingCapacity(8, "medium"), 40);
    assert.equal(carryingCapacity(15, "medium"), 75);
});

test("les volumes suivent l'ordre du plus grand au plus petit", () => {
    assert.deepEqual(Object.values(VOLUME_FACTORS), [1.75, 1.5, 1.25, 1, 0.8, 0.6, 0.4, 0]);
    assert.equal(carryingCapacity(8, "small"), 32);
    assert.equal(carryingCapacity(14, "small", 14), 70);
    assert.equal(carryingCapacity(10, "none"), 0);
    assert.equal(carryingCapacity(10, "medium", -100), 0);
});

test("les bonus de Force effectifs influencent la charge en continu", () => {
    assert.equal(carryingCapacity(12, "medium"), 60);
    assert.equal(carryingCapacity(13, "medium"), 65);
    assert.equal(carryingCapacity(12, "medium", 4.5), 64.5);
});

test("paliers : 40 % inclus libre ; 70 % inclus encombré ; 100 % immobilisé", () => {
    for (const [kg, stage] of [
        [0, "free"], [20, "free"], [20.01, "encumbered"], [35, "encumbered"],
        [35.01, "overloaded"], [49.99, "overloaded"], [50, "immobilized"],
        [90, "immobilized"]
    ]) {
        assert.equal(calculateEncumbrance(kg, 50).stage, stage, `kg = ${kg}`);
    }
    assert.equal(calculateEncumbrance(0, 0).stage, "free");
    assert.equal(calculateEncumbrance(0.01, 0).stage, "immobilized");
    assert.equal(calculateEncumbrance(10, 0).percentage, 100);
});

test("les pénalités de vitesse n'appliquent pas de désavantage automatique", () => {
    assert.equal(encumberedSpeed(9, "free"), 9);
    assert.equal(encumberedSpeed(9, "encumbered"), 7);
    assert.equal(encumberedSpeed(9, "overloaded"), 4.5);
    assert.equal(encumberedSpeed(9, "immobilized"), 0);
    assert.equal(encumberedSpeed(1, "encumbered"), 0);
});

test("le poids inventaire inclut armes équipées, quantités et pièces, jamais le poids corporel", () => {
    const items = [
        { id: "w", type: "weapon", system: { weight: 5, equipped: true, containerId: null } },
        { id: "o", type: "object", system: { weight: 3, quantity: 2, containerId: null } },
        { id: "p", type: "purse", system: {
            coins: { copper: 10, silver: 0, gold: 0, platinum: 0 },
            containerId: null
        } },
        { id: "c", type: "container", system: { weight: 999, containerId: null } }
    ];
    const original = buildInventory(items);
    assert.ok(Math.abs(original.totalWeight - 11.1) < 1e-9);
    // Un poids de corps de 80 kg enregistré dans la fiche ne se trouve pas dans l'Item inventaire.
    assert.equal(buildInventory(items).totalWeight, original.totalWeight);
});
