import { openCharacterEffectsEditor } from "../../module/applications/character-effects-editor.mjs";

export async function runCharacterEffectsTests({ test, assert, equal }) {
    const previous = foundry.applications.api.DialogV2;
    let serial = 0;
    const dialogs = [], writes = [], notices = [];
    foundry.utils.randomID = () => `effect${++serial}`;
    foundry.data = { operators: { ForcedDeletion: class {} } };
    ui.notifications.error = message => notices.push(message);
    ui.notifications.warn = message => notices.push(message);
    class Dialog extends EventTarget {
        constructor(config) {
            super(); this.config = config;
            assert(config.content instanceof HTMLDivElement, "Dialog content is not a div");
            assert(config.content.attributes.length === 0, "Dialog content root has attributes");
            dialogs.push(this);
        }
        async render() {
            this.element = document.createElement("section");
            const form = document.createElement("form");
            form.innerHTML = this.config.content.innerHTML;
            this.element.append(form); document.querySelector("main").append(this.element);
            this.dispatchEvent(new Event("render")); return this;
        }
        async renderChild(child) { return child.render(); }
        async close() { this.element.remove(); this.dispatchEvent(new Event("close")); }
    }
    foundry.applications.api.DialogV2 = Dialog;
    const equipment = { id: "shield", name: "Écu en bois", type: "shield", system: { equipped: true, shieldClass: "Écu" } };
    const actor = { name: "Test", type: "character", isOwner: true, system: { abilities: {}, consciousness: { value: 12, max: 20 }, fever: { value: 4, max: 6 } }, items: [equipment] };
    const owner = { id: "trait", type: "trait", name: "Robustesse", isOwner: true, system: {
        effectRules: {}, conditions: {}, effectActivation: { mode: "always", enabled: true }, conditionMatch: "all"
    }, async update(changes) { writes.push(changes); } };
    const change = (root, selector, value) => {
        const field = root.querySelector(selector); assert(field, `Missing ${selector}`);
        if (field.type === "checkbox") field.checked = value;
        else field.value = value;
        field.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const save = dialog => dialog.config.buttons.find(button => button.action === "save").callback(null,
        { form: dialog.element.querySelector("form") }, dialog);
    try {
        await test("effect editor preserves one draft across tabs without duplicate click handlers", async () => {
            writes.length = 0;
            const dialog = await openCharacterEffectsEditor(owner, { actor });
            for (let i = 0; i < 3; i++) {
                dialog.element.querySelector('[data-effect-tab="preview"]').click();
                dialog.element.querySelector('[data-effect-tab="effects"]').click();
            }
            dialog.element.querySelector('[data-add-effect="stat"]').click();
            equal(dialog.element.querySelectorAll("[data-effect-rule]").length, 1);
            change(dialog.element, '[data-efield="target"]', "carryingCapacity");
            change(dialog.element, '[data-efield="amount"]', "10");
            change(dialog.element, '[data-efield="coefficient"]', "2");
            change(dialog.element, '[data-efield="addBefore"]', "yes");
            assert(dialog.element.querySelector("[data-rule-summary]").textContent.includes("(base +10) × 2"), "Wrong multiplier order preview");
            equal(writes.length, 0);
            await save(dialog);
            equal(writes.length, 1);
            const rule = Object.values(writes[0]["system.effectRules"])[0];
            equal([rule.target, rule.amount, rule.coefficient, rule.addBefore], ["carryingCapacity", 10, 2, true]);
        });
        await test("equipment criterion offers yes/no, actual equipment labels and a live reading", async () => {
            writes.length = 0;
            const dialog = await openCharacterEffectsEditor(owner, { actor });
            dialog.element.querySelector('[data-effect-tab="activation"]').click();
            change(dialog.element, '[data-source="mode"]', "conditions");
            dialog.element.querySelector("[data-add-condition]").click();
            change(dialog.element, '[data-cfield="metric"]', "equipped");
            assert(!dialog.element.querySelector('[data-cfield="value"]'), "Boolean criterion still has a numeric threshold");
            change(dialog.element, '[data-cfield="keyChoice"]', "shield");
            equal(dialog.element.querySelector('[data-cfield="presence"]').value, "yes");
            assert(dialog.element.querySelector("[data-condition-preview]").textContent.includes("Écu en bois"), "Missing readable equipment name");
            assert(dialog.element.querySelector("[data-condition-preview]").textContent.includes("✓ Remplie"), "Live criterion not evaluated");
            await save(dialog);
            const condition = Object.values(writes[0]["system.conditions"])[0];
            equal([condition.metric, condition.key, condition.operator, condition.value], ["equipped", "shield", "=", 1]);
        });
        await test("roll editor can store both flags and cancelling leaves the source untouched", async () => {
            writes.length = 0;
            const dialog = await openCharacterEffectsEditor(owner, { actor });
            dialog.element.querySelector('[data-add-effect="roll"]').click();
            change(dialog.element, '[data-efield="advantage"]', true);
            change(dialog.element, '[data-efield="disadvantage"]', true);
            change(dialog.element, '[data-efield="label"]', "<b>source</b>");
            dialog.element.querySelector('[data-effect-tab="preview"]').click();
            assert(dialog.element.textContent.includes("→ Neutre"), "Missing cancellation preview");
            assert(!dialog.element.querySelector("b"), "A label became HTML");
            await dialog.config.buttons.find(button => button.action === "cancel").callback(null, null, dialog);
            equal(writes.length, 0);
        });
        await test("removing an existing effect uses a document deletion operation", async () => {
            writes.length = 0;
            const source = { ...owner, system: { ...owner.system, effectRules: { old: { kind: "roll", label: "Avant", enabled: true, amount: 0, scope: "all", advantage: true, disadvantage: false } } } };
            const dialog = await openCharacterEffectsEditor(source, { actor });
            dialog.element.querySelector('[data-remove-effect="old"]').click();
            await save(dialog);
            assert(writes[0]["system.effectRules"].old instanceof foundry.data.operators.ForcedDeletion, "Removed rule would survive a merged document update");
            equal(notices, []);
        });
    } finally { foundry.applications.api.DialogV2 = previous; }
}
