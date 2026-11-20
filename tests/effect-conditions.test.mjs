import test from "node:test";
import assert from "node:assert/strict";
import { activeCharacterEffects, characterEffectSources, effectRuleActive, effectSourceActive,
    newEffectRule, resolveRollEffects, sourceConditionsSatisfied } from "../module/character-effects.mjs";

const selected = (ids, match = "all", extra = {}) => ({ ...newEffectRule("roll"), amount: 2,
    activationMode: "conditions", conditionMode: "selected", conditionIds: ids, conditionMatch: match, ...extra });
function fixture(rules) {
    const source = { id: "trait", type: "trait", name: "Deux états", system: {
        effectActivation: { enabled: true, mode: "conditions" }, conditionMatch: "all",
        conditions: { ready: { kind: "manual", enabled: true }, danger: { kind: "manual", enabled: false } },
        effectRules: rules
    } };
    return { source, actor: { system: {}, items: [source] } };
}

test("each effect selects its own conditions and combines only that selection with AND or OR", () => {
    const { actor, source } = fixture({ ready: selected(["ready"]), danger: selected(["danger"]),
        both: selected(["ready", "danger"]), either: selected(["ready", "danger"], "any"),
        never: selected(["ready"], "all", { enabled: false }),
        legacy: { kind: "roll", enabled: true, amount: 100, scope: "all" } });
    const before = structuredClone(actor);
    assert.deepEqual(activeCharacterEffects(actor).map(rule => rule.id), ["ready", "either"]);
    assert.equal(resolveRollEffects(activeCharacterEffects(actor), { type: "save" }).bonus, 4);
    assert.equal(effectSourceActive(actor, source), true);
    assert.equal(sourceConditionsSatisfied(actor, source.system), false);
    assert.deepEqual(characterEffectSources(actor)[1].rules.map(rule => rule.active), [true, false, false, true, false, false]);
    assert.deepEqual(actor, before);
    source.system.conditions.ready.enabled = false;
    assert.equal(activeCharacterEffects(actor).length, 0);
    assert.equal(effectSourceActive(actor, source), false);
    source.system.conditions.danger.enabled = true;
    assert.deepEqual(activeCharacterEffects(actor).map(rule => rule.id), ["danger", "either"]);
});

test("an empty custom selection requires no condition; deleted references are never silently ignored", () => {
    const { actor } = fixture({ none: selected([]), emptyAny: selected([], "any"),
        missing: selected(["deleted"]), both: selected(["ready", "deleted"]), either: selected(["ready", "deleted"], "any") });
    assert.deepEqual(activeCharacterEffects(actor).map(rule => rule.id), ["none", "emptyAny", "either"]);
});

test("condition IDs resolve only inside their own source", () => {
    const { actor, source } = fixture({ local: selected(["danger"]), foreign: selected(["foreign"]) });
    actor.system.conditions = { foreign: { kind: "manual", enabled: true } };
    actor.items.push({ ...structuredClone(source), id: "other", system: {
        effectRules: { other: selected(["danger"]) }, effectActivation: { mode: "always" },
        conditions: { danger: { kind: "manual", enabled: true }, foreign: { kind: "manual", enabled: true } }
    } });
    assert.deepEqual(activeCharacterEffects(actor).map(rule => rule.sourceId), ["other"]);
});

test("independent condition selections ignore every former source activation switch", () => {
    const { actor, source } = fixture({ local: selected(["ready"]) });
    const rule = source.system.effectRules.local;
    for (const mode of ["always", "manual", "passive", "duration", "conditions"]) {
        source.system.effectActivation = { mode, enabled: false, active: false };
        assert.equal(effectRuleActive(actor, source, rule), true, mode);
        source.system.conditions.ready.enabled = false;
        assert.equal(effectRuleActive(actor, source, rule), false, mode);
        source.system.conditions.ready.enabled = true;
    }
    delete rule.activationMode;
    assert.equal(effectRuleActive(actor, source, rule), true, "previous custom selections are independent too");
});

test("passive and duration modes are evaluated for each effect", () => {
    const { actor, source } = fixture({ passive: selected([], "all", { activationMode: "passive" }),
        duration: selected([], "all", { activationMode: "duration" }) });
    source.type = "aptitude";
    source.system.category = "technique";
    source.system.effectDuration = { enabled: true, remaining: 0 };
    assert.equal(activeCharacterEffects(actor).length, 0);
    source.system.category = "passive";
    assert.deepEqual(activeCharacterEffects(actor).map(rule => rule.id), ["passive"]);
    source.system.effectDuration.remaining = 1;
    assert.deepEqual(activeCharacterEffects(actor).map(rule => rule.id), ["passive", "duration"]);
});

test("legacy effects retain the common activation and combination until customized", () => {
    const { actor, source } = fixture({ legacy: { kind: "roll", scope: "all", amount: 5 } });
    assert.equal(activeCharacterEffects(actor).length, 0);
    source.system.conditionMatch = "any";
    assert.equal(activeCharacterEffects(actor).length, 1);
    source.system.effectActivation.mode = "always";
    source.system.conditions.ready.enabled = false;
    assert.equal(activeCharacterEffects(actor).length, 1);
    source.system.effectActivation.mode = "conditions";
    source.system.conditions = {};
    assert.equal(activeCharacterEffects(actor).length, 0);
});
