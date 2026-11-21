import test from "node:test";
import assert from "node:assert/strict";
import { weaponAttackRestrictions } from "../module/weapon-usage.mjs";
import { buildInventory } from "../module/inventory.mjs";
import { transferPlan } from "../module/inventory-transfer.mjs";
const weapon=(id,properties=[],corporeal=false)=>({id,type:"weapon",system:{properties:new Set(properties),corporeal,equipped:true,weight:10,containerId:null,heavy:{strengthRequirement:14}}});
test("Heavy compares the score of the ability actually used, including derived scores",()=>{
    const w=weapon("w",["heavy"]),a={items:[w],system:{abilities:{dexterity:{value:8,effective:14}}},getWeaponAbilityData:()=>({key:"dexterity"})};
    assert.equal(weaponAttackRestrictions(a,w).disadvantage,false);
    a.system.abilities.dexterity.effective=13;assert.equal(weaponAttackRestrictions(a,w).disadvantage,true);
});
test("Two Hands conflicts with another physical weapon or shield but not a corporeal weapon",()=>{
    const w=weapon("w",["twoHanded"]),other=weapon("other",[],true);
    const a={items:[w,other],system:{abilities:{strength:{value:16}}},getWeaponAbilityData:()=>({key:"strength"})};
    assert.equal(weaponAttackRestrictions(a,w).disadvantage,false);
    other.system.corporeal=false;assert.equal(weaponAttackRestrictions(a,w).disadvantage,true);
    other.system.equipped=false;assert.equal(weaponAttackRestrictions(a,w).disadvantage,false);
    a.items.push({id:"s",type:"shield",system:{equipped:true}});assert.equal(weaponAttackRestrictions(a,w).disadvantage,true);
});
test("corporeal weapons have no carried weight and cannot be transferred",()=>{
    const w=weapon("body",[],true);assert.equal(buildInventory([w]).totalWeight,0);
    assert.throws(()=>transferPlan([w],[{id:w.id}],()=>"new"),/corporelle/);
});
