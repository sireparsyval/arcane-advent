import test from "node:test";
import assert from "node:assert/strict";
import { unarmedDamage, equippedAttackShortcuts } from "../module/combat-shortcuts.mjs";
import { newEffectRule } from "../module/character-effects.mjs";
function actor(items = [], settings = {}) {
    return { items, getFlag: () => settings, system: { abilities: { strength: {modifier:2}, dexterity:{modifier:4} }, effectRules: {} },
        getWeaponAbilityData: () => ({ key:"strength", modifier:2 }), getExpertiseBonus: () => 3 };
}
test("unarmed damage defaults to Force, selected Expertises contribute once and bonus damage ignores the modifier", () => {
    const items = [{id:"e",type:"expertise",system:{bonus:2}},{id:"unused",type:"expertise",system:{bonus:9}}];
    assert.equal(unarmedDamage(actor(items)).damage, 3);
    const config = { expertiseIds:["e","e","deleted"], bonusAction:true, ability:"strength" };
    assert.equal(unarmedDamage(actor(items,config)).damage, 5);
    assert.equal(unarmedDamage(actor(items,config)).bonusDamage, 3);
    assert.equal(unarmedDamage(actor(items,{...config,ability:"best"})).damage, 7);
    assert.equal(unarmedDamage(actor(items,{...config,ability:"dexterity"})).damage, 7);
    const negative = actor(items,config); negative.system.abilities.strength.modifier = -3;
    assert.equal(unarmedDamage(negative).damage, 0); assert.equal(unarmedDamage(negative).bonusDamage, 3);
});
test("equipped shortcuts follow equipment order, show the full attack bonus and select icons and secondary damage", () => {
    const weapon = (id, properties, sort, equipped = true) => ({id,name:id,type:"weapon",sort,system:{properties:new Set(properties),equipped,damageFormula:"1d4",versatile:{damageFormula:"1d6"}}});
    const a = actor([weapon("bow",["ammunition"],3),weapon("blade",["light","versatile"],1),weapon("knife",["thrown"],2),weapon("off",[],0,false)]);
    a.system.effectRules.attack = {...newEffectRule("roll"),scope:"attack",amount:2};
    const rows = equippedAttackShortcuts(a);
    assert.deepEqual(rows.map(r=>r.id),["blade","knife","bow"]);
    assert.deepEqual(rows.map(r=>r.icon),["⚔️","🗡️","🏹"]);
    assert.equal(rows[0].attack,"+7"); assert.equal(rows[0].versatile,"1d6"); assert.equal(rows[0].light,true);
    assert.equal(rows[0].formula,"1d4");
});
