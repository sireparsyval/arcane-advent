import test from "node:test";
import assert from "node:assert/strict";
import { activeCharacterEffects, characterEffectSources, effectRuleActive, effectSourceActive,
    newEffectRule, resolveRollEffects, sourceConditionsSatisfied } from "../module/character-effects.mjs";

const selected = (ids, match = "all", extra = {}) => ({ ...newEffectRule("roll"), amount: 2,
    conditionMode: "selected", conditionIds: ids, conditionMatch: match, ...extra });
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

test("custom condition selections respect the source switch, manual activation, passive category and duration", () => {
    const { actor, source } = fixture({ local: selected(["ready"]) });
    const rule = source.system.effectRules.local;
    source.type = "aptitude";
    for (const [mode, category, active, remaining, expected] of [
        ["always", "technique", false, 0, true], ["manual", "technique", false, 0, false],
        ["manual", "technique", true, 0, true], ["passive", "technique", false, 0, false],
        ["passive", "passive", false, 0, true], ["duration", "technique", false, 0, false],
        ["duration", "technique", false, 1, true], ["conditions", "technique", false, 0, true]
    ]) {
        Object.assign(source.system, { category, effectActivation: { mode, active, enabled: true },
            effectDuration: { enabled: true, remaining } });
        assert.equal(effectRuleActive(actor, source, rule), expected, mode);
        source.system.effectActivation.enabled = false;
        assert.equal(effectRuleActive(actor, source, rule), false, "source disabled: " + mode);
    }
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
