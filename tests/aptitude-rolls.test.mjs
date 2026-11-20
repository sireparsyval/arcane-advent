import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialogs = [];
let serial = 0, generatedIds = [];
class ForcedDeletion {}
function editor() {
    const listeners = new Map();
    return {
        listeners, ownerDocument: globalThis.document,
        querySelector(selector) {
            if (selector === '[name="target.mode"]') return { value: "self" };
            if (selector === '[name="target.shape"]') return { value: "circle" };
            if (selector === '[name="target.rangeMode"]') return { value: "melee" };
            return { innerHTML: "", addEventListener() {}, setAttribute() {} };
        },
        querySelectorAll: () => [],
        addEventListener(name, callback) { listeners.set(name, callback); }
    };
}
class Dialog extends EventTarget {
    constructor(options) {
        super(); this.options = options; this.editor = editor();
        this.element = { querySelector: () => this.editor }; dialogs.push(this);
    }
    async render() { this.dispatchEvent(new Event("render")); return this; }
    async renderChild(child) { return child.render(); }
    async close() { this.closed = true; this.dispatchEvent(new Event("close")); }
}
globalThis.Item = class {};
globalThis.foundry = {
    abstract: { TypeDataModel: class {} },
    data: { fields: {}, operators: { ForcedDeletion } },
    utils: { randomID: () => generatedIds.shift() ?? `roll${++serial}` },
    dice: { Roll: { validate: formula => /^\d+d\d+$/.test(formula) } },
    applications: {
        sheets: { ActorSheetV2: class {} },
        api: { HandlebarsApplicationMixin: Base => Base, DialogV2: Dialog },
        handlebars: { async renderTemplate(_path, context) { return JSON.stringify(context.current ?? {}); } }
    }
};
globalThis.document = { createElement: () => ({ innerHTML: "", querySelector: () => ({ innerHTML: "" }) }) };
globalThis.FormData = class {
    constructor(form) { this.fields = form.fields; }
    get(key) { return this.fields[key] ?? null; }
    getAll(key) { return this.fields[key] ?? []; }
    has(key) { return Object.hasOwn(this.fields, key); }
};
globalThis.ui = { notifications: { warn() {} } };
const { ArcaneCharacterSheet } = await import("../module/applications/actor/character-sheet.mjs");
const optionsTemplate = readFileSync(new URL("../templates/actor/aptitude-options-dialog.hbs", import.meta.url), "utf8");
const addButton = [...optionsTemplate.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find(([, , text]) => text.includes("Ajouter un jet"));
assert.ok(addButton, "The aptitude options must expose an add-roll button");

function roll(name, formula = "1d20") {
    return { name, formula, ability: "", abilities: new Set(), skillId: "", expertiseId: "" };
}
function fixture(rolls = {}, editable = true) {
    dialogs.length = 0; generatedIds = [];
    const writes = [];
    const item = { id: "aptitude", name: "Flamme", type: "aptitude", system: {
        rolls: structuredClone(rolls), conditions: {}, category: "technique", showOptions: {},
        effectDuration: { enabled: false, remaining: 0, unit: "turns" },
        chargeCounter: { max: 0 }, recoveryCounter: { max: 0, unit: "turns" },
        castingCounter: { max: 0, unit: "turns" }, durationTurns: 0, durationUnit: "turns"
    }, async update(changes) {
        writes.push(changes);
        for (const [path, value] of Object.entries(changes)) {
            if (path.startsWith("system.rolls.")) {
                this.system.rolls[path.slice("system.rolls.".length)] = { ...value, abilities: new Set(value.abilities) };
            } else if (path === "system") {
                for (const [id, operation] of Object.entries(value.rolls)) {
                    assert.ok(operation instanceof ForcedDeletion);
                    delete this.system.rolls[id];
                }
            } else if (path.startsWith("system.")) {
                const keys = path.split(".").slice(1);
                const last = keys.pop();
                const destination = keys.reduce((target, key) => target[key] ??= {}, this.system);
                destination[last] = value;
            } else assert.fail(`Unexpected write: ${path}`);
        }
    } };
    const items = new Map([[item.id, item]]);
    items.filter = fn => [...items.values()].filter(fn);
    return { sheet: { isEditable: editable, actor: { items } }, item, writes };
}
async function openRoll(sheet, rollId) {
    return ArcaneCharacterSheet._onEditAptitudeRoll.call(sheet, null, { dataset: { itemId: "aptitude", rollId } });
}
async function optionsAdd(sheet, parent) {
    // Follow the actual button markup through the options' event delegation.
    const attribute = addButton[1].match(/data-aa-(?:add-)?roll/)[0];
    const key = attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return parent.editor.listeners.get("click")({ target: { closest: selector =>
        selector.includes(`[${attribute}]`) ? { dataset: { [key]: "" } } : null } });
}
async function save(dialog, name, formula = "1d20") {
    const form = { reportValidity: () => true,
        fields: { name, formula, abilities: [], skillId: "", expertiseId: "" } };
    return dialog.options.buttons.find(button => button.action === "save").callback(null, { form }, dialog);
}

test("adding two rolls from aptitude options keeps both names and formulas", async () => {
    const { sheet, item } = fixture();
    await ArcaneCharacterSheet._onEditAptitudeOptions.call(sheet, null, { dataset: { itemId: "aptitude" } });
    const parent = dialogs[0];
    await optionsAdd(sheet, parent);
    await save(dialogs.at(-1), "Attaque", "1d20");
    await optionsAdd(sheet, parent);
    await save(dialogs.at(-1), "Dégâts", "2d6");
    assert.equal(Object.keys(item.system.rolls).length, 2);
    assert.deepEqual(Object.values(item.system.rolls).map(({ name, formula }) => [name, formula]),
        [["Attaque", "1d20"], ["Dégâts", "2d6"]]);
    assert.ok(Object.keys(item.system.rolls).every(Boolean));
});

test("two add editors saved in reverse order have independent identities", async () => {
    const { sheet, item } = fixture();
    const first = await openRoll(sheet), second = await openRoll(sheet);
    await save(second, "Second", "2d6"); await save(first, "Premier", "1d20");
    assert.deepEqual(Object.values(item.system.rolls).map(roll => roll.name), ["Second", "Premier"]);
});

test("editing or deleting one roll preserves its sibling and ID", async () => {
    const { sheet, item } = fixture({ attack: roll("Attaque"), damage: roll("Dégâts", "2d6") });
    const before = structuredClone(item.system.rolls.damage);
    await save(await openRoll(sheet, "attack"), "Attaque précise", "2d20");
    assert.deepEqual(Object.keys(item.system.rolls), ["attack", "damage"]);
    assert.equal(item.system.rolls.attack.name, "Attaque précise");
    assert.deepEqual(item.system.rolls.damage, before);
    const dialog = await openRoll(sheet, "attack");
    await dialog.options.buttons.find(button => button.action === "remove").callback(null, null, dialog);
    assert.deepEqual(item.system.rolls, { damage: before });
});

test("a legacy empty-ID roll is retained when adding and can still be edited and deleted", async () => {
    const legacy = roll("Jet conservé", "3d6");
    const { sheet, item } = fixture({ "": legacy });
    await ArcaneCharacterSheet._onEditAptitudeOptions.call(sheet, null, { dataset: { itemId: "aptitude" } });
    await optionsAdd(sheet, dialogs[0]);
    await save(dialogs.at(-1), "Nouveau jet", "1d20");
    assert.deepEqual(item.system.rolls[""], legacy);
    const legacyEditor = await openRoll(sheet, "");
    assert.equal(JSON.parse(legacyEditor.options.content.innerHTML).name, "Jet conservé");
    await save(legacyEditor, "Ancien jet modifié", "4d6");
    assert.equal(item.system.rolls[""].formula, "4d6");
    const dialog = await openRoll(sheet, "");
    await dialog.options.buttons.find(button => button.action === "remove").callback(null, null, dialog);
    assert.equal(Object.hasOwn(item.system.rolls, ""), false);
    assert.equal(Object.values(item.system.rolls)[0].name, "Nouveau jet");
});

test("cancelling a new roll does not alter saved rolls", async () => {
    const { sheet, item, writes } = fixture({ original: roll("Original") });
    const before = structuredClone(item.system.rolls);
    const dialog = await openRoll(sheet);
    await dialog.options.buttons.find(button => button.action === "cancel").callback(null, null, dialog);
    assert.deepEqual(item.system.rolls, before); assert.deepEqual(writes, []);
});

test("an editor for a removed roll cannot recreate it", async () => {
    const { sheet, item, writes } = fixture({ original: roll("Original") });
    const dialog = await openRoll(sheet, "original");
    delete item.system.rolls.original;
    await save(dialog, "Modification périmée");
    assert.deepEqual(item.system.rolls, {}); assert.deepEqual(writes, []);
});

test("submitting the same add editor twice retains a single roll", async () => {
    const { sheet, item } = fixture();
    const dialog = await openRoll(sheet);
    await Promise.all([save(dialog, "Jet"), save(dialog, "Jet")]);
    assert.equal(Object.keys(item.system.rolls).length, 1);
});

test("a newly generated ID never replaces an existing one", async () => {
    const { sheet, item } = fixture({ existing: roll("Original") });
    generatedIds = ["existing", "fresh"];
    await save(await openRoll(sheet), "Nouveau");
    assert.equal(item.system.rolls.existing.name, "Original");
    assert.equal(item.system.rolls.fresh.name, "Nouveau");
});

test("read-only sheets and nonexistent roll IDs cannot open an editor", async () => {
    const { sheet, writes } = fixture({}, false);
    assert.equal(await openRoll(sheet), undefined);
    assert.equal(dialogs.length, 0); assert.deepEqual(writes, []);
    const editable = fixture();
    assert.equal(await openRoll(editable.sheet, "missing"), undefined);
    assert.equal(dialogs.length, 0);
});

test("aptitude options save both distance ranges and retain long range when switching to melee", async () => {
    const { sheet, item } = fixture();
    item.system.targeting = { mode: "single", rangeMode: "melee", range: 1.5, longRange: 0 };
    const submit = async fields => {
        await ArcaneCharacterSheet._onEditAptitudeOptions.call(sheet, null, { dataset: { itemId: "aptitude" } });
        const dialog = dialogs.at(-1);
        await dialog.options.buttons.find(button => button.action === "save")
            .callback(null, { form: { reportValidity: () => true, fields } }, dialog);
    };
    await submit({ "target.mode": "single", "target.rangeMode": "ranged", "target.range": "12.5", "target.longRange": "25" });
    assert.deepEqual(item.system.targeting, { mode: "single", rangeMode: "ranged", range: 12.5, longRange: 25, travels: false });
    await submit({ "target.mode": "single", "target.rangeMode": "melee", "target.range": "1.5" });
    assert.equal(item.system.targeting.rangeMode, "melee");
    assert.equal(item.system.targeting.range, 1.5);
    assert.equal(item.system.targeting.longRange, 25);
});

test("aptitude options reject invalid range modes and long ranges before writing", async () => {
    for (const values of [
        { "target.rangeMode": "invalid", "target.range": "10" },
        { "target.rangeMode": "ranged", "target.range": "10", "target.longRange": "5" },
        { "target.rangeMode": "ranged", "target.range": "10", "target.longRange": "-1" }
    ]) {
        const { sheet, writes } = fixture();
        await ArcaneCharacterSheet._onEditAptitudeOptions.call(sheet, null, { dataset: { itemId: "aptitude" } });
        const dialog = dialogs.at(-1);
        await dialog.options.buttons.find(button => button.action === "save").callback(null,
            { form: { reportValidity: () => true, fields: { "target.mode": "single", ...values } } }, dialog);
        assert.deepEqual(writes, []);
    }
});

test("enregistrer les Options préserve les conditions gérées par leur éditeur dédié", async () => {
    const { sheet, item, writes } = fixture();
    Object.assign(item.system, {
        requirements: "Note conservée", requireConditions: true, conditionMatch: "any",
        conditions: { manual: { kind: "manual", label: "Météo", enabled: false } }
    });
    await ArcaneCharacterSheet._onEditAptitudeOptions.call(sheet, null, { dataset: { itemId: item.id } });
    const parent = dialogs[0];
    // Des modifications dans l’éditeur dédié pendant l’ouverture des Options restent intactes.
    item.system.conditions.manual.enabled = true;
    item.system.requirements = "Nouvelle précision";
    const before = structuredClone(item.system);
    await parent.options.buttons.find(button => button.action === "save").callback(null,
        { form: { reportValidity: () => true, fields: {} } }, parent);
    assert.equal(writes.length, 1);
    for (const key of ["conditions", "requirements", "requireConditions", "conditionMatch"]) {
        assert.deepEqual(item.system[key], before[key]);
        assert.ok(!Object.keys(writes[0]).some(path => path === "system." + key || path.startsWith("system." + key + ".")));
    }
    assert.doesNotMatch(optionsTemplate, /name="(?:requirements|requireConditions|conditionMatch)"|data-aa-condition/);
});

test("Techniques et Sorts proposent Repos Long et enregistrent tous les compteurs", async () => {
    const originalRender = foundry.applications.handlebars.renderTemplate;
    let rendered;
    foundry.applications.handlebars.renderTemplate = async (path, context) => {
        if (path.endsWith("aptitude-options-dialog.hbs")) rendered = context;
        return originalRender(path, context);
    };
    try {
        for (const category of ["technique", "spell"]) {
            const { sheet, item } = fixture();
            item.system.category = category;
            await ArcaneCharacterSheet._onEditAptitudeOptions.call(sheet, null, { dataset: { itemId: item.id } });
            assert.ok(rendered.units.some(unit => unit.key === "longRest" && unit.label === "Repos Long"));
            const dialog = dialogs[0];
            await dialog.options.buttons.find(button => button.action === "save").callback(null, { form: {
                reportValidity: () => true, fields: {
                    "enable.charge": "on", "charge.remaining": "2", "charge.max": "3",
                    "enable.recovery": "on", "recovery.remaining": "1", "recovery.max": "2", "recovery.unit": "longRest",
                    "enable.casting": "on", "casting.remaining": "1", "casting.max": "4", "casting.unit": "turns",
                    "effect.enabled": "on", "effect.remaining": "3", "effect.unit": "longRest"
                }
            } }, dialog);
            assert.deepEqual(item.system.chargeCounter, { remaining: 2, max: 3 });
            assert.deepEqual(item.system.recoveryCounter, { remaining: 1, max: 2, unit: "longRest" });
            assert.deepEqual(item.system.castingCounter, { remaining: 1, max: 4, unit: "turns" });
            assert.deepEqual(item.system.effectDuration, { enabled: true, remaining: 3, unit: "longRest" });
            assert.equal(item.system.durationUnit, "longRest");
            assert.deepEqual(item.system.showOptions, { charge: true, recovery: true, casting: true, duration: true });
        }
    } finally {
        foundry.applications.handlebars.renderTemplate = originalRender;
    }
});

test("les boutons des trois compteurs restent entre zéro et leur maximum sans changer les unités", async () => {
    const action = ArcaneCharacterSheet.DEFAULT_OPTIONS.actions.stepAptitudeCounter;
    for (const counter of ["charge", "recovery", "casting"]) {
        const { sheet, item, writes } = fixture();
        const value = item.system[counter + "Counter"] = { remaining: 1, max: 2, unit: "longRest" };
        const step = delta => action.call(sheet, null, { dataset: { itemId: item.id, counter, step: String(delta) } });
        await step(-1);
        assert.equal(value.remaining, 0);
        const afterZero = writes.length;
        await step(-1);
        assert.equal(writes.length, afterZero);
        await step(1); await step(1);
        assert.equal(value.remaining, 2);
        const afterMax = writes.length;
        await step(1);
        assert.equal(writes.length, afterMax);
        assert.equal(value.max, 2);
        assert.equal(value.unit, "longRest");
        sheet.isEditable = false;
        await step(-1);
        assert.equal(value.remaining, 2);
    }
});

test("la durée restante ne descend pas sous zéro et les anciennes durées restent synchronisées", async () => {
    const action = ArcaneCharacterSheet.DEFAULT_OPTIONS.actions.stepAptitudeCounter;
    for (const enabled of [true, false]) {
        const { sheet, item, writes } = fixture();
        item.system.effectDuration = { enabled, remaining: 1, unit: enabled ? "longRest" : "turns" };
        item.system.durationTurns = 1;
        item.system.durationUnit = "longRest";
        const step = delta => action.call(sheet, null, { dataset: { itemId: item.id, counter: "duration", step: String(delta) } });
        await step(-1);
        assert.equal(item.system.durationTurns, 0);
        assert.equal(item.system.effectDuration.remaining, 0);
        const count = writes.length;
        await step(-1);
        assert.equal(writes.length, count);
        await step(1); await step(1);
        assert.equal(item.system.durationTurns, 2);
        assert.equal(item.system.effectDuration.remaining, 2);
        assert.equal(item.system.effectDuration.unit, "longRest");
        assert.equal(item.system.effectDuration.enabled, enabled);
        for (const [counter, delta] of [["unknown", 1], ["duration", 5]]) {
            await action.call(sheet, null, { dataset: { itemId: item.id, counter, step: String(delta) } });
            assert.equal(item.system.durationTurns, 2);
        }
    }
});
