import test from "node:test";
import assert from "node:assert/strict";
import { newEffectRule, resolveRollEffects, effectRuleSummary } from "../module/character-effects.mjs";
import { isAptitudeDamageRoll } from "../module/damage-effects.mjs";
import { serializeTraitParameters, parseTraitParameters } from "../module/trait-clipboard.mjs";
const rule = data => ({ ...newEffectRule("roll"), scope: "damage", ...data });
const weapon = id => ({ type: "damage", damageSource: "weapon", itemId: id });
const aptitude = id => ({ type: "damage", damageSource: "aptitude", itemId: id });

test("les dégâts excluent les effets d20, attaques et aptitudes génériques", () => {
    const rules = [rule({ amount: 3 }), ...["all", "attack", "aptitude"].map(scope => rule({ scope, amount: 99 }))];
    assert.equal(resolveRollEffects(rules, weapon("w")).bonus, 3);
    assert.equal(resolveRollEffects([rules[0]], { type: "attack" }).bonus, 0);
    assert.equal(resolveRollEffects([rules[0]], { type: "aptitude" }).bonus, 0);
    assert.equal(resolveRollEffects(rules, { type: "damage", damageSource: "improvised" }).bonus, 3);
});
test("Tout, Arme et Aptitude sélectionnent plusieurs identifiants sans fuite ni repli sur tout", () => {
    const rules = [rule({ amount: 1 }), rule({ damageSource: "weapon", damageAll: false, damageItemIds: ["w1", "w2"], amount: 4 }),
        rule({ damageSource: "aptitude", damageAll: false, damageItemIds: ["a1", "a2"], amount: -2 })];
    for (const id of ["w1", "w2"]) assert.equal(resolveRollEffects(rules, weapon(id)).bonus, 5);
    for (const id of ["a1", "a2"]) assert.equal(resolveRollEffects(rules, aptitude(id)).bonus, -1);
    assert.equal(resolveRollEffects(rules, weapon("w3")).bonus, 1);
    assert.equal(resolveRollEffects(rules, aptitude("w1")).bonus, 1);
    assert.equal(resolveRollEffects([rule({ damageSource: "weapon", damageAll: false, damageItemIds: [], amount: 9 })], weapon("w1")).bonus, 0);
    assert.equal(resolveRollEffects([rule({ damageSource: "aptitude", damageAll: true, amount: 7 })], aptitude("future")).bonus, 7);
});
test("les dégâts ignorent les anciens filtres et tous les avantages ou désavantages", () => {
    const state = resolveRollEffects([rule({ ability: "strength", skill: "Discrétion", amount: 2, advantage: true, disadvantage: true })], weapon("w"), "advantage");
    assert.equal(state.bonus, 2); assert.equal(state.mode, "normal");
    assert.equal(state.advantage, false); assert.equal(state.disadvantage, false);
    assert.equal(resolveRollEffects([rule({ enabled: false, amount: 8 })], weapon("w")).bonus, 0);
});
test("les jets de dégâts d’aptitudes sont distincts des soins, même avec la même formule", () => {
    assert.equal(isAptitudeDamageRoll({ name: "Dégâts : Déflagration", formula: "1d6" }), true);
    assert.equal(isAptitudeDamageRoll({ name: "Brûlure", purpose: "damage", formula: "1d20" }), true);
    assert.equal(isAptitudeDamageRoll({ name: "Soin", formula: "1d6" }), false);
    assert.equal(isAptitudeDamageRoll({ name: "Dégâts récupérés", purpose: "other", formula: "1d6" }), false);
});
test("le récapitulatif et le copier/coller gardent les sélections indépendantes", () => {
    const damage = rule({ damageSource: "weapon", damageAll: false, damageItemIds: ["w1", "w2"], amount: 2, advantage: true });
    const actor = { items: new Map([["w1", { name: "Lame" }], ["w2", { name: "Arc" }]]) };
    const summary = effectRuleSummary(damage, { actor });
    assert.match(summary, /Lame, Arc/); assert.doesNotMatch(summary, /Avantage/);
    const data = parseTraitParameters(serializeTraitParameters({ name: "Trait", description: "", requirements: "", effectRules: { damage }, conditions: {} }));
    assert.deepEqual(data.effectRules.damage.damageItemIds, ["w1", "w2"]);
    data.effectRules.damage.damageItemIds.pop(); assert.equal(damage.damageItemIds.length, 2);
});
