import test from "node:test";
import assert from "node:assert/strict";
import {
    MODIFIER_TARGETS, modifierTotals, abilityScoreModifier
} from "../module/modifiers.mjs";

const condition = (type, modifiers) => ({ type, system: { modifiers } });

test("scores impairs : 13 - 1 garde +1, tandis que 12 - 1 devient +0", () => {
    assert.equal(abilityScoreModifier(13, -1), 1);
    assert.equal(abilityScoreModifier(12, -1), 0);
    assert.equal(abilityScoreModifier(13, 0), 1);
    assert.equal(abilityScoreModifier(12, 0), 1);
    assert.equal(abilityScoreModifier(15, 2), 3);
});

test("les sources sont additives, sans plafonnement ni priorité", () => {
    const manual = { strength: 2, defense: 1 };
    const items = [
        condition("alteration", { strength: -2, defense: -1, initiative: -2 }),
        condition("injury", { strength: -1, initiative: 1 }),
        condition("trait", { strength: 99 }) // Les Traits ne sont pas des sources automatiques.
    ];
    const result = modifierTotals(manual, items);
    assert.equal(result.strength, -1);
    assert.equal(result.defense, 0);
    assert.equal(result.initiative, -1);
    assert.equal(result.dexterity, 0);
    assert.equal(Object.keys(result).length, Object.keys(MODIFIER_TARGETS).length);
    assert.equal(abilityScoreModifier(13, result.strength), 1);
});

test("un bonus direct au Tracker n'affecte pas la caractéristique associée", () => {
    const result = modifierTotals({}, [
        condition("alteration", { defense: 2, initiative: -3, passivePerception: 1, speed: -1.5 })
    ]);
    assert.equal(result.dexterity, 0);
    assert.equal(result.wisdom, 0);
    assert.equal(result.defense, 2);
    assert.equal(result.initiative, -3);
    assert.equal(result.passivePerception, 1);
    assert.equal(result.speed, -1.5);
});

test("supprimer une condition supprime automatiquement ses contributions au total", () => {
    const manual = { constitution: 1 };
    const illness = condition("injury", { constitution: -2 });
    assert.equal(modifierTotals(manual, [illness]).constitution, -1);
    assert.equal(modifierTotals(manual, []).constitution, 1);
});

test("aucune source : toutes les modifications valent zéro", () => {
    assert.ok(Object.values(modifierTotals({}, [])).every(value => value === 0));
});
