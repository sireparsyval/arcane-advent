import test from "node:test";
import assert from "node:assert/strict";
import { createTraitParameterClipboard, serializeTraitParameters, parseTraitParameters } from "../module/trait-clipboard.mjs";
import { newEffectRule } from "../module/character-effects.mjs";

function draft() {
    return { name: "Agilité naturelle", description: "Description <em>complète</em>", requirements: "Exceptions libres", conditionMatch: "any",
        effectRules: { effect: { ...newEffectRule("roll"), ability: "dexterity", skill: "Discrétion", amountFormula: "max(@abilities.dexterity.modifier, @abilities.constitution.modifier)",
            advantage: true, activationMode: "conditions", conditionIds: ["ready"], conditionMatch: "any" } },
        conditions: { ready: { label: "Prêt", kind: "manual", enabled: true, metric: "pdcRatio", operator: "<", value: 50, key: "", expression: "", consumes: false } } };
}

test("trait parameters round-trip with all fields and preserve effect-to-condition references", () => {
    const source = draft();
    const text = serializeTraitParameters({ ...source, id: "source-id", actor: "source-actor", flags: { private: true } });
    const result = parseTraitParameters(text);
    assert.deepEqual(result, source);
    assert.equal(Object.hasOwn(result, "id"), false);
    assert.equal(Object.hasOwn(result, "actor"), false);
    assert.equal(Object.hasOwn(result, "flags"), false);
    result.effectRules.effect.conditionIds.push("other");
    assert.deepEqual(source.effectRules.effect.conditionIds, ["ready"]);
});

test("the system clipboard supports another session without sharing mutable parameters", async () => {
    let text = "";
    const source = createTraitParameterClipboard({ writeText: async value => { text = value; } });
    assert.deepEqual(await source.copy(draft()), { sessionOnly: false });
    const target = createTraitParameterClipboard({ readText: async () => text });
    assert.deepEqual(await target.paste(), draft());
    const first = await target.paste();
    first.conditions.ready.label = "Modifiée";
    assert.equal((await target.paste()).conditions.ready.label, "Prêt");
});

test("a browser without clipboard access retains an independent session copy", async () => {
    const clipboard = createTraitParameterClipboard({ writeText: async () => { throw Error("Denied"); }, readText: async () => "foreign" });
    const source = draft();
    assert.deepEqual(await clipboard.copy(source), { sessionOnly: true });
    source.effectRules.effect.conditionIds = [];
    assert.deepEqual((await clipboard.paste()).effectRules.effect.conditionIds, ["ready"]);
    const pasted = await clipboard.paste();
    pasted.name = "Modifié";
    assert.equal((await clipboard.paste()).name, "Agilité naturelle");
});

test("reading restrictions use the session copy but foreign clipboard data never silently restores an old copy", async () => {
    let fail = true;
    const clipboard = createTraitParameterClipboard({ writeText: async () => {}, readText: async () => { if (fail) throw Error("Denied"); return "texte étranger"; } });
    await clipboard.copy(draft());
    assert.deepEqual(await clipboard.paste(), draft());
    fail = false;
    await assert.rejects(clipboard.paste(), /paramètres de Trait valides/);
    const empty = createTraitParameterClipboard({ readText: async () => { throw Error("Denied"); } });
    await assert.rejects(empty.paste(), /Copiez d’abord/);
});

test("malformed, wrong-type or prototype-bearing payloads are rejected before use", () => {
    const valid = JSON.parse(serializeTraitParameters(draft()));
    for (const text of ["", "{}", "texte", JSON.stringify({ ...valid, type: "other" }), JSON.stringify({ ...valid, version: 2 }),
        JSON.stringify({ ...valid, parameters: { ...valid.parameters, effectRules: [] } }),
        JSON.stringify({ ...valid, parameters: { ...valid.parameters, name: { invalid: true } } }),
        JSON.stringify({ ...valid, parameters: { ...valid.parameters, effectRules: { bad: { ...newEffectRule(), conditionIds: [42] } } } })]) {
        assert.throws(() => parseTraitParameters(text), /paramètres de Trait valides/);
    }
    const text = serializeTraitParameters(draft()).replace('"conditions":{', '"conditions":{"__proto__":{"polluted":true},');
    assert.throws(() => parseTraitParameters(text), /paramètres de Trait valides/);
    assert.equal({}.polluted, undefined);
});
