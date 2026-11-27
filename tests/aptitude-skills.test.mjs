import test from "node:test";
import assert from "node:assert/strict";
import { aptitudeSkillData, aptitudeSkillSuggestions } from "../module/aptitude-skills.mjs";
import { newEffectRule } from "../module/character-effects.mjs";
const actor = () => ({ system: { effectRules: { arcane: { ...newEffectRule("roll"), scope: "skill", skill: "Arcanisme", ability: "wisdom", advantage: true } } },
    items: new Map([["s", { id: "s", name: "Discrétion", type: "skill", system: { mastery: 2 } }]]) });

test("un nom libre ne crée pas de maîtrise et retrouve une maîtrise existante sans accents ni casse", () => {
    const a = actor();
    assert.deepEqual(aptitudeSkillData(a, { skillName: " Arcanisme " }), { skillName: "Arcanisme", skillId: "", mastery: 0 });
    assert.deepEqual(aptitudeSkillData(a, { skillName: "discretion" }), { skillName: "Discrétion", skillId: "s", mastery: 2 });
    assert.equal(a.items.size, 1);
});
test("les anciennes références, les renommages et une future maîtrise restent utilisables", () => {
    const a = actor();
    assert.equal(aptitudeSkillData(a, { skillId: "s" }).skillName, "Discrétion");
    a.items.get("s").name = "Furtivité";
    assert.equal(aptitudeSkillData(a, { skillId: "s", skillName: "Discrétion" }).skillName, "Furtivité");
    a.items.set("arcane", { id: "arcane", type: "skill", name: "Arcanisme", system: { mastery: 3 } });
    assert.equal(aptitudeSkillData(a, { skillName: "Arcanisme" }).mastery, 3);
    a.items.delete("arcane");
    assert.equal(aptitudeSkillData(a, { skillName: "Arcanisme", skillId: "arcane" }).mastery, 0);
});
test("les suggestions réunissent maîtrises et compétences avec effets actifs sans doublons", () => {
    const a = actor();
    a.items = [...a.items.values()];
    a.system.effectRules.same = { ...newEffectRule("roll"), scope: "skill", skill: "discretion", advantage: true };
    a.system.effectRules.inactive = { ...newEffectRule("roll"), scope: "skill", skill: "Survie", enabled: false };
    assert.deepEqual(aptitudeSkillSuggestions(a), ["Arcanisme", "Discrétion"]);
});
