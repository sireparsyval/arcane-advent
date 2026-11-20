import test from "node:test";
import assert from "node:assert/strict";
import { conditionControls, readConditionControls, validateCondition } from "../module/applications/effect-condition-controls.mjs";
import { activeCharacterEffects, applyStatisticEffects, newEffectRule } from "../module/character-effects.mjs";

const actor = { system: { defense: { stance: "dodge" } }, items: [] };
const condition = { kind: "automatic", metric: "defenseStance", key: "dodge", operator: "=", value: 1 };

test("l'éditeur propose les stances et un choix actif/inactif, sans seuil numérique ni saisie libre", () => {
    const html = conditionControls(actor, condition);
    assert.match(html, /value="defenseStance" selected/);
    assert.match(html, /value="dodge" selected/);
    assert.match(html, /value="defend"/);
    assert.match(html, /Oui — stance active/);
    assert.match(html, /Non — stance inactive/);
    assert.doesNotMatch(html, /data-cfield="(?:value|operator|customKey)"/);
    assert.doesNotThrow(() => validateCondition(condition));
    assert.throws(() => validateCondition({ ...condition, key: "unknown" }), /stance.*valide/);
    for (const presence of ["yes", "no"]) {
        const fields = [{ dataset: { cfield: "metric" }, value: "defenseStance" }];
        const root = { querySelectorAll: () => fields, querySelector: selector =>
            selector.includes("keyChoice") ? { value: "defend" }
                : selector.includes("presence") ? { value: presence } : null };
        const saved = readConditionControls(root, condition);
        assert.equal(saved.metric, "defenseStance");
        assert.equal(saved.key, "defend");
        assert.equal(saved.operator, presence === "yes" ? "=" : "!=");
        assert.equal(saved.value, 1);
    }
});

test("les effets sélectionnés suivent la stance, y compris depuis la lecture avant effets", () => {
    const subject = {
        system: { defense: { stance: "none" }, effectSnapshot: { abilities: {}, defense: { stance: "none" } } },
        items: [{ id: "trait", type: "trait", system: {
            conditions: { stance: condition },
            effectRules: { defense: { ...newEffectRule(), target: "defense", amount: 4,
                activationMode: "conditions", conditionIds: ["stance"] } }
        } }]
    };
    for (const stance of ["none", "dodge", "defend", "dodge", "none"]) {
        subject.system.defense.stance = stance;
        subject.system.effectSnapshot.defense.stance = stance;
        assert.equal(applyStatisticEffects(10, "defense", activeCharacterEffects(subject)), stance === "dodge" ? 14 : 10);
    }
    subject.items[0].system.conditions.stance.operator = "!=";
    assert.equal(applyStatisticEffects(10, "defense", activeCharacterEffects(subject)), 14);
});
