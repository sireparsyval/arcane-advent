import test from "node:test";
import assert from "node:assert/strict";
import { expertiseMatches, matchingExpertiseBonus, normalizedClasses } from "../module/expertise.mjs";

const expertise = (options = {}) => ({
    type: "expertise",
    system: {
        domain: "weaponClass", target: "", classes: new Set(["Espadon", "Claymore"]),
        propertyFilters: { twoHanded: "required", ammunition: "excluded" }, bonus: 3,
        ...options
    }
});
const weapon = (cls, props = ["twoHanded"], equipped = true) => ({
    type: "weapon", name: cls,
    system: { weaponClass: cls, properties: new Set(props), equipped }
});

test("classes alternatives et critères requis/exclus simultanés", () => {
    const exp = expertise();
    assert.equal(expertiseMatches(exp, weapon("Espadon")), true);
    assert.equal(expertiseMatches(exp, weapon("Claymore")), true);
    assert.equal(expertiseMatches(exp, weapon("Claymore", ["twoHanded", "ammunition"])), false);
    assert.equal(expertiseMatches(exp, weapon("Claymore", ["finesse"])), false);
    assert.equal(expertiseMatches(exp, weapon("Masse")), false);
});

test("plusieurs correspondances donnent un seul bonus par Expertise", () => {
    const exp = expertise();
    assert.equal(matchingExpertiseBonus([exp], weapon("Claymore"), "weaponClass"), 3);
    assert.equal(matchingExpertiseBonus([exp, expertise({ bonus: 2 })], weapon("Claymore"), "weaponClass"), 5);
});

test("les anciennes Expertises à cible unique restent reconnues", () => {
    const exp = expertise({ target: "Épée", classes: new Set(), propertyFilters: {} });
    assert.deepEqual(normalizedClasses(exp), ["Épée"]);
    assert.equal(expertiseMatches(exp, weapon("ÉPÉE", [])), true);
    assert.equal(expertiseMatches(exp, weapon("Épée", [], false)), false);
});

test("une Expertise d'arme peut n'exiger qu'une propriété", () => {
    const exp = expertise({ target: "", classes: new Set(), propertyFilters: { twoHanded: "required" } });
    assert.equal(expertiseMatches(exp, weapon("", ["twoHanded"])), true);
    assert.equal(expertiseMatches(exp, weapon("", ["light"])), false);
    assert.equal(expertiseMatches(exp, {
        type: "object", system: { properties: new Set(["twoHanded"]) }
    }), false);
});

test("classes d'objet pour objets non équipables et noms d'objet historiques", () => {
    const exp = expertise({ domain: "toolObject", target: "", classes: new Set(["Pioche"]), propertyFilters: {} });
    assert.equal(expertiseMatches(exp, {
        type: "object", name: "Vieille pioche", system: { objectClass: "Pioche", quantity: 1 }
    }), true);
    const legacy = expertise({ domain: "toolObject", target: "Vieille pioche", classes: new Set(), propertyFilters: {} });
    assert.equal(expertiseMatches(legacy, {
        type: "object", name: "Vieille pioche", system: { objectClass: "" }
    }), true);
});

test("Expertise hors équipement : Autre", () => {
    assert.equal(expertiseMatches(expertise({ domain: "other" }), null), true);
});
