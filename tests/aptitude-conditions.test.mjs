import test from "node:test";
import assert from "node:assert/strict";
import { aptitudeConditionStatus, evaluateAptitudeExpression, conditionKeyChoices, conditionSummary } from "../module/aptitude-conditions.mjs";

const actor = {
    system: {
        consciousness: { value: 40, max: 100 },
        fever: { value: 3, max: 10 },
        abilities: {
            strength: { effective: 14 }, dexterity: { effective: 8 },
            constitution: { effective: 10 }, intelligence: { effective: 12 },
            wisdom: { effective: 10 }, charisma: { effective: 10 }
        }
    },
    items: [
        { id: "weapon", type: "weapon", name: "Espadon", system: { equipped: true, weaponClass: "Épée lourde", properties: new Set(["twoHanded"]) } },
        { id: "alteration", type: "alteration", name: "Brûlure", system: {} },
        { id: "object", type: "object", name: "Reagent", system: { quantity: 3, objectClass: "Cristal" } },
        { id: "purse", type: "purse", name: "Bourse", system: { coins: { copper: 30, silver: 1, gold: 4, platinum: 0 } } },
        { id: "exp", type: "expertise", name: "Grandes lames", system: { domain: "weaponClass", target: "", classes: new Set(["Épée lourde"]), propertyFilters: { twoHanded: "required" }, bonus: 3 } }
    ]
};
const condition = (metric, key = "", value = 1, operator = ">=") =>
    ({ kind: "automatic", metric, key, value, operator, expression: "" });

test("indicateur manuel indépendant des données du personnage", () => {
    assert.equal(aptitudeConditionStatus(actor, { kind: "manual", enabled: true }), true);
    assert.equal(aptitudeConditionStatus(actor, { kind: "manual", enabled: false }), false);
});
test("pourcentage de PdC/PdF et caractéristique effective", () => {
    assert.equal(aptitudeConditionStatus(actor, condition("pdcRatio", "", 50, "<")), true);
    assert.equal(aptitudeConditionStatus(actor, condition("pdfRatio", "", 20, "<")), false);
    assert.equal(aptitudeConditionStatus(actor, condition("ability", "strength", 14, ">=")), true);
});
test("altérations, équipement, expertise utilisable", () => {
    assert.equal(aptitudeConditionStatus(actor, condition("alteration", "Brûlure", 1, "=")), true);
    assert.equal(aptitudeConditionStatus(actor, condition("equipped", "Épée lourde", 1, "=")), true);
    assert.equal(aptitudeConditionStatus(actor, condition("expertise", "Grandes lames", 1, "=")), true);
});
test("quantités d'objets, classes d'objets, pièces spécifiques", () => {
    assert.equal(aptitudeConditionStatus(actor, condition("inventory", "Cristal", 3, ">=")), true);
    assert.equal(aptitudeConditionStatus(actor, condition("luqa", "gold", 5, ">=")), false);
    assert.equal(aptitudeConditionStatus(actor, condition("luqa", "copper", 20, ">=")), true);
});
test("interpréteur mathématique et booléen, sans JavaScript exécutable", () => {
    const vars = { pdc: 40, pdcMax: 100, FOR: 14, CON: 10 };
    assert.equal(evaluateAptitudeExpression("pdc < pdcMax * 0.5 && FOR >= 14", vars), true);
    assert.equal(evaluateAptitudeExpression("FOR < 10 || !(CON == 10)", vars), false);
    assert.equal(evaluateAptitudeExpression("this.constructor.constructor('return 1')()", vars), false);
    assert.equal(evaluateAptitudeExpression("FOR / 0 > 1", vars), false);
});

test("une condition sans cible ne peut pas correspondre à des champs vides", () => {
    assert.equal(aptitudeConditionStatus(actor, condition("inventory", "", 1, ">=")), false);
    assert.equal(aptitudeConditionStatus(actor, condition("equipped", "", 1, "=")), false);
    assert.equal(aptitudeConditionStatus(actor, condition("luqa", "", 1, ">=")), false);
});

test("la propriété Garde peut servir de condition d'équipement", () => {
    assert.ok(conditionKeyChoices(actor, "equipmentProperty")
        .some(choice => choice.value === "guard" && choice.label === "Garde"));
    const subject = { ...actor, items: [{ type: "weapon",
        system: { equipped: true, properties: new Set(["guard"]) } }] };
    assert.equal(aptitudeConditionStatus(subject, condition("equipmentProperty", "guard", 1, "=")), true);
    subject.items[0].system.equipped = false;
    assert.equal(aptitudeConditionStatus(subject, condition("equipmentProperty", "guard", 1, "=")), false);
});

test("les conditions de stance distinguent actif et inactif pour Esquive et Se Défendre", () => {
    assert.deepEqual(conditionKeyChoices(actor, "defenseStance"), [
        { value: "dodge", label: "Esquive" }, { value: "defend", label: "Se Défendre" }
    ]);
    for (const stance of [undefined, "none", "dodge", "defend"]) {
        const subject = { ...actor, system: { ...actor.system, defense: { stance } } };
        for (const key of ["dodge", "defend"]) {
            assert.equal(aptitudeConditionStatus(subject, condition("defenseStance", key, 1, "=")), stance === key);
            assert.equal(aptitudeConditionStatus(subject, condition("defenseStance", key, 1, "!=")), stance !== key);
            assert.equal(aptitudeConditionStatus(subject, condition("defenseStance", key, 0, "=")), stance !== key);
        }
    }
    assert.match(conditionSummary(actor, condition("defenseStance", "dodge", 1, "!=")), /Stance de Défense — Esquive : non/);
    for (const key of ["", "unknown", "none", "toString"]) {
        assert.equal(aptitudeConditionStatus(actor, condition("defenseStance", key, 1, "!=")), false);
    }
});
