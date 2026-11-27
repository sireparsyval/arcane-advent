import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import { activeCharacterEffects, resolveRollEffects } from "../module/character-effects.mjs";
const source = readFileSync(new URL("../module/documents/actor.mjs",import.meta.url),"utf8");
const declaration = source.slice(source.indexOf("    async rollWeaponDamage("), source.indexOf("    getWeaponAbilityData("));
const rollDamage = new Function("activeCharacterEffects", "resolveRollEffects", "return ({"+declaration.trim()+"}).rollWeaponDamage")(activeCharacterEffects, resolveRollEffects);

test("light versatile bonus damage uses the secondary die and retains only negative ability modifiers", async () => {
    const messages=[];
    globalThis.foundry={dice:{Roll:class {
        constructor(formula){this.formula=formula;} async evaluate(){} async toMessage(data){messages.push(data);}
    }},documents:{ChatMessage:{getSpeaker:()=>({})}}};
    const weapon={id:"w",type:"weapon",name:"Lame",system:{damageFormula:"1d4",versatile:{damageFormula:"1d6"}}};
    let modifier=3;
    const actor={system:{},items:new Map([["w",weapon]]),getWeaponAbilityData:()=>({modifier})};
    assert.equal((await rollDamage.call(actor,"w",{versatile:true,bonusAction:true})).formula,"1d6");
    assert.match(messages.at(-1).flavor,/polyvalents.*bonus/);
    modifier=-2;
    assert.equal((await rollDamage.call(actor,"w",{versatile:true,bonusAction:true})).formula,"1d6 - 2");
    assert.equal((await rollDamage.call(actor,"w",{bonusAction:true})).formula,"1d4 - 2");
    modifier=3;
    assert.equal((await rollDamage.call(actor,"w",{versatile:true})).formula,"1d6 + 3");
});

test("missing normal or versatile damage warns instead of silently ignoring a damage shortcut", async () => {
    const warnings=[];
    globalThis.ui={notifications:{warn:message=>warnings.push(message)}};
    globalThis.foundry={dice:{Roll:class{constructor(){assert.fail("No roll should be created without a formula");}}}};
    const weapon={id:"knife",type:"weapon",name:"Couteau",system:{damageFormula:"",versatile:{damageFormula:"  "}}};
    const actor={items:new Map([["knife",weapon]])};
    for(const options of [{},{bonusAction:true},{versatile:true},{versatile:true,bonusAction:true}]) {
        assert.equal(await rollDamage.call(actor,"knife",options),undefined);
        assert.match(warnings.at(-1),/formule.*Couteau.*Équipement/);
        assert.equal(warnings.at(-1).includes("polyvalents"),Boolean(options.versatile));
    }
    assert.equal(warnings.length,4);
});
