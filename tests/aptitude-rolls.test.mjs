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
            return { innerHTML: "" };
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
