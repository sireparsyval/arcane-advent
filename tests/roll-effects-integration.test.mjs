import test from "node:test";
import assert from "node:assert/strict";
import { newEffectRule } from "../module/character-effects.mjs";
import { effectSkillRows } from "../module/effect-skills.mjs";

let natural = 12;
const messages = [], warnings = [];
class Items extends Map {
    [Symbol.iterator]() { return this.values(); }
    filter(fn) { return [...this.values()].filter(fn); }
    some(fn) { return [...this.values()].some(fn); }
}
class Roll {
    constructor(formula) { this.formula = formula; this.dice = [{ values: [natural] }]; this.total = natural; }
    async evaluate() { return this; }
    async render() { return `<h4 class="dice-total">${this.total}</h4>`; }
    async toMessage(data, options) { if (options?.create === false) return { ...data }; messages.push(data); return data; }
}
globalThis.Actor = class {};
globalThis.Item = class {};
globalThis.foundry = { utils: { escapeHTML: value => String(value).replaceAll("<", "&lt;") }, dice: { Roll },
    documents: { ChatMessage: { getSpeaker: () => ({}), create: async data => messages.push(data) } } };
globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
const { ArcaneActor } = await import("../module/documents/actor.mjs");
const rule = changes => ({ ...newEffectRule("roll"), ...changes });
function fixture(rules) {
    natural = 12; messages.length = warnings.length = 0;
    const actor = new ArcaneActor();
    actor.items = new Items();
    actor.system = { rollMode: "normal", effectRules: rules,
        abilities: { strength: { modifier: 2 }, dexterity: { modifier: 1 } },
        savingThrows: { strength: { total: 5 }, dexterity: { total: 3 } }, trackers: { initiative: 1 } };
    actor.getRollData = () => ({});
    return actor;
}

test("actor roll methods combine the manual selector with permanent sources and the proper roll context", async () => {
    const actor = fixture({ force: rule({ scope: "ability", ability: "strength", advantage: true, amount: 2 }),
        save: rule({ scope: "save", disadvantage: true }) });
    let result = await actor.rollAbility("strength");
    assert.equal(result.mode, "advantage");
    assert.equal(result.modifier, 4);
    result = await actor.rollAbility("dexterity");
    assert.equal(result.mode, "normal");
    assert.equal(result.modifier, 1);
    actor.system.rollMode = "advantage";
    result = await actor.rollSavingThrow("dexterity");
    assert.equal(result.mode, "normal");
    assert.equal(result.modifier, 3);
});

test("skill and aptitude rolls receive their targeted bonuses once", async () => {
    const actor = fixture({ skill: rule({ scope: "skill", skill: "Discrétion", amount: 3 }),
        aptitude: rule({ scope: "aptitude", ability: "strength", amount: 4, advantage: true }) });
    actor.items.set("s", { id: "s", name: "Discrétion", type: "skill", system: { ability: "dexterity", mastery: 2 } });
    let result = await actor.rollSkill("s");
    assert.equal(result.modifier, 6);
    const aptitude = { id: "a", type: "aptitude", name: "Bond", system: { rolls: {
        r: { formula: "1d20", abilities: new Set(["strength", "dexterity"]), skillId: "", expertiseId: "" },
        custom: { formula: "2d6", abilities: new Set(["strength"]), skillId: "", expertiseId: "" }
    } } };
    actor.items.set("a", aptitude);
    result = await actor.rollAptitude("a", "r");
    assert.equal(result.modifier, 7);
    assert.equal(result.mode, "advantage");
    const custom = await actor.rollAptitude("a", "custom");
    assert.equal(custom.formula, "2d6 + 6");
});

test("automatic skills match their totals and disappear as soon as a mastery is added without losing its effects", async () => {
    const actor = fixture({ named: rule({ scope: "skill", skill: "Discrétion", ability: "dexterity", amount: 3, advantage: true }),
        generic: rule({ scope: "all", amount: 2 }) });
    let row = effectSkillRows(actor)[0];
    let result = await actor.rollEffectSkill(row.key);
    assert.equal(row.total, 6);
    assert.equal(result.modifier, row.total);
    assert.equal(result.mode, "advantage");
    assert.equal(actor.items.size, 0);
    actor.system.rollMode = "disadvantage";
    assert.equal((await actor.rollEffectSkill(row.key)).mode, "normal");
    actor.items.set("s", { id: "s", name: "Discrétion", type: "skill", system: { ability: "dexterity", mastery: 9 } });
    assert.deepEqual(effectSkillRows(actor), []);
    let before = messages.length;
    assert.equal(await actor.rollEffectSkill(row.key), undefined);
    assert.equal(messages.length, before);
    assert.equal((await actor.rollSkill("s")).modifier, 15);
    actor.items.delete("s");
    row = effectSkillRows(actor)[0];
    assert.equal(row.total, 6);
    actor.system.effectRules.named.enabled = false;
    before = messages.length;
    assert.equal(await actor.rollEffectSkill(row.key), undefined);
    assert.equal(messages.length, before);
    assert.equal(warnings.length, 2);
});

test("automatic skills with an unspecified ability cannot roll", async () => {
    const actor = fixture({ missing: rule({ scope: "skill", skill: "Navigation", advantage: true }) });
    const row = effectSkillRows(actor)[0];
    assert.equal(await actor.rollEffectSkill(row.key), undefined);
    assert.equal(messages.length, 0);
    assert.equal(warnings.length, 1);
});

test("an unmet required condition blocks aptitude use, while natural criticals keep their rules", async () => {
    const actor = fixture({ bonus: rule({ amount: 10, advantage: true }) });
    actor.items.set("a", { id: "a", type: "aptitude", system: { requireConditions: true,
        conditions: { ready: { kind: "manual", enabled: false } }, rolls: { r: { formula: "1d20" } } } });
    await actor.rollAptitude("a", "r");
    assert.equal(messages.length, 0);
    assert.equal(warnings.length, 1);
    natural = 1;
    assert.equal((await actor.rollAbility("strength")).total, 1);
    natural = 20;
    assert.equal((await actor.rollAbility("strength")).total, 20);
});

test("token HUD resource edits clamp to the effective maximum without changing the base maximum", async () => {
    const actor = fixture({});
    actor.system.consciousness = { value: 18, max: 20, effectiveMax: 25 };
    const writes = [];
    globalThis.Hooks = { call: () => true };
    actor.update = async data => { writes.push(data); return actor; };
    await actor.modifyTokenAttribute("consciousness", 7, true, true);
    assert.deepEqual(writes.pop(), { "system.consciousness.value": 25 });
    assert.equal(actor.system.consciousness.max, 20);
    Hooks.call = () => false;
    await actor.modifyTokenAttribute("consciousness", 5, true, true);
    assert.equal(writes.length, 0);
});

test("sheet initiative keeps modifiers on natural 1 and 20 and allows zero or negative totals", async () => {
    const actor = fixture({});
    for (const [die, modifier, total] of [[1, 4, 5], [20, 4, 24], [1, -1, 0], [3, -7, -4]]) {
        natural = die;
        actor.system.trackers.initiative = modifier;
        const result = await actor.rollInitiativeCheck();
        assert.equal(result.total, total);
        assert.equal(result.modifier, modifier);
        assert.match(result.chatData.content, new RegExp(`>${total}</h4>`));
        assert.doesNotMatch(result.chatData.content, /aa-natural-(1|20)/);
    }
});

test("initiative is strictly one d20 plus the displayed score, without mode or additional roll effects", async () => {
    const actor = fixture({
        all: rule({ scope: "all", advantage: true, amount: 10 }),
        check: rule({ scope: "ability", ability: "dexterity", amount: 5 }),
        initiative: rule({ scope: "initiative", disadvantage: true, amount: 7 })
    });
    actor.system.rollMode = "advantage";
    actor.system.trackers.initiative = -2;
    natural = 1;
    const result = await actor.rollInitiativeCheck("disadvantage");
    assert.equal(result.roll.formula, "1d20 - 2");
    assert.equal(result.mode, "normal");
    assert.equal(result.modifier, -2);
    assert.equal(result.total, -1);
    assert.doesNotMatch(result.chatData.flavor, /Effets :/);
});

test("les dégâts normaux, polyvalents et bonus appliquent une seule fois les bonus ciblés et conditionnels", async () => {
    const actor = fixture({ generic: rule({ scope: "all", amount: 99 }),
        damage: rule({ scope: "damage", damageSource: "weapon", damageAll: false, damageItemIds: ["w"], amountFormula: "@abilities.strength.modifier", activationMode: "conditions", conditionIds: ["ready"] }) });
    actor.system.conditions = { ready: { kind: "manual", enabled: true } };
    actor.items.set("w", { id: "w", type: "weapon", name: "Lame", system: { damageFormula: "1d4", versatile: { damageFormula: "1d6" }, properties: new Set() } });
    for (const [options, formula] of [[{}, "1d4 + 2 + 2"], [{ versatile: true }, "1d6 + 2 + 2"], [{ bonusAction: true }, "1d4 + 2"], [{ versatile: true, bonusAction: true }, "1d6 + 2"]]) {
        assert.equal((await actor.rollWeaponDamage("w", options)).formula, formula);
    }
    actor.system.conditions.ready.enabled = false;
    assert.equal((await actor.rollWeaponDamage("w")).formula, "1d4 + 2");
    actor.system.conditions.ready.enabled = true; actor.system.effectRules.damage.amountFormula = "-3";
    assert.equal((await actor.rollWeaponDamage("w", { bonusAction: true })).formula, "1d4 - 3");
});

test("une aptitude applique le bonus de dégâts à ses dégâts seuls et respecte les choix d’éléments", async () => {
    const actor = fixture({ damage: rule({ scope: "damage", damageSource: "aptitude", damageAll: false, damageItemIds: ["a"], amount: 4 }),
        allDamage: rule({ scope: "damage", amount: 1 }) });
    const rolls = { damage: { name: "Dégâts", formula: "1d6", abilities: new Set(["strength"]) },
        heal: { name: "Soin", formula: "1d6" }, attack: { name: "Action", formula: "1d20" },
        named: { name: "Brûlure", formula: "1d4", purpose: "damage" },
        d20: { name: "Dégâts", formula: "1d20", purpose: "damage" } };
    actor.items.set("a", { id: "a", type: "aptitude", name: "Flamme", system: { rolls } });
    actor.items.set("other", { id: "other", type: "aptitude", name: "Autre", system: { rolls } });
    assert.equal((await actor.rollAptitude("a", "damage")).formula, "1d6 + 7");
    assert.equal((await actor.rollAptitude("a", "heal")).formula, "1d6");
    assert.equal((await actor.rollAptitude("a", "attack")).modifier, 0);
    assert.equal((await actor.rollAptitude("a", "named")).formula, "1d4 + 5");
    assert.equal((await actor.rollAptitude("a", "d20")).formula, "1d20 + 5");
    assert.equal((await actor.rollAptitude("other", "damage")).formula, "1d6 + 3");
    assert.equal((await actor.rollImprovisedDamage()).formula, "1d4 + 3");
});
