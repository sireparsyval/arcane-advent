import test from "node:test";
import assert from "node:assert/strict";
import { unarmedDamage, equippedAttackShortcuts } from "../module/combat-shortcuts.mjs";
import { newEffectRule } from "../module/character-effects.mjs";
function actor(items = [], settings = {}) {
    return { items, getFlag: () => settings, system: { abilities: { strength: {modifier:2}, dexterity:{modifier:4} }, effectRules: {} },
        getWeaponAbilityData: () => ({ key:"strength", modifier:2 }), getExpertiseBonus: () => 3 };
}
test("unarmed damage uses Force and ignores old Expertise, ability and bonus-action settings", () => {
    const items=[{id:"e",type:"expertise",system:{bonus:9}}];
    const a=actor(items,{expertiseIds:["e"],ability:"dexterity",bonusAction:true});
    assert.deepEqual(unarmedDamage(a),{damage:3});
    a.system.abilities.strength.modifier=-2;
    assert.deepEqual(unarmedDamage(a),{damage:-1});
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

test("conditional unarmed effects update normal and bonus damage and resolve sheet references", () => {
    const rule = { ...newEffectRule(), target:"unarmedDamage", amountFormula:"@abilities.dexterity.modifier",
        activationMode:"conditions", conditionIds:["ready"] };
    const trait = { id:"trait",type:"trait",name:"Poings",system:{conditions:{ready:{kind:"manual",enabled:true}},effectRules:{damage:rule}} };
    const a = actor([trait,{id:"e",type:"expertise",system:{bonus:2}}],{expertiseIds:["e"],bonusAction:true});
    assert.equal(unarmedDamage(a).damage,7);
    trait.system.conditions.ready.enabled=false;
    assert.equal(unarmedDamage(a).damage,3);
    trait.system.conditions.ready.enabled=true; rule.enabled=false;
    assert.equal(unarmedDamage(a).damage,3);
});

test("unarmed bonuses before and after multiplication follow the standard effect calculation", () => {
    const a = actor();
    a.system.effectRules = {
        before:{...newEffectRule(),target:"unarmedDamage",amount:1,addBefore:true,coefficient:2},
        after:{...newEffectRule(),target:"unarmedDamage",amount:3},
        unrelated:{...newEffectRule(),target:"defense",amount:100}
    };
    assert.equal(unarmedDamage(a).damage,11);
});
