import test from "node:test";
import assert from "node:assert/strict";
import { newEffectRule } from "../module/character-effects.mjs";
import { effectSkillRows } from "../module/effect-skills.mjs";
import { openEffectSkillsDialog } from "../module/applications/effect-skills-dialog.mjs";

const hooks = new Map();
let nextHook = 0, creations = 0;
globalThis.Hooks = { on(name, callback) { const id = ++nextHook; hooks.set(id, { name, callback }); return id; }, off(_name, id) { hooks.delete(id); } };
const emit = (name, doc) => { for (const hook of [...hooks.values()]) if (hook.name === name) hook.callback(doc); };
globalThis.document = { createElement: () => ({ innerHTML: "" }) };
globalThis.ui = { notifications: { error: message => assert.fail(message) } };
class Dialog extends EventTarget {
    constructor(options) {
        super(); creations++; this.options = options;
        this.root = { innerHTML: "", onclick: null };
        this.element = { querySelector: () => this.root };
    }
    async render() { this.rendered = true; this.dispatchEvent(new Event("render")); return this; }
    bringToFront() { this.raised = true; }
    close() { this.rendered = false; this.dispatchEvent(new Event("close")); }
}
globalThis.foundry = { utils: { escapeHTML: text => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") },
    applications: { api: { DialogV2: Dialog } } };
function actor(ability = "dexterity") {
    return { uuid: "Actor.pc", name: "Test", items: [], system: { rollMode: "normal", abilities: { dexterity: { modifier: 2 } },
        effectRules: { named: { ...newEffectRule("roll"), scope: "skill", skill: "Discrétion <test>", ability, amount: 2, advantage: true } } } };
}

test("the read-only skill dialog rolls without closing and refreshes mode and named effects", async () => {
    const a = actor(), rolls = [];
    a.rollEffectSkill = async key => rolls.push(key);
    const dialog = await openEffectSkillsDialog(a);
    assert.match(dialog.root.innerHTML, /Discrétion &lt;test&gt;/);
    assert.match(dialog.root.innerHTML, />\+4<\/strong>/);
    assert.match(dialog.root.innerHTML, /✔️/);
    assert.doesNotMatch(dialog.root.innerHTML, /<input|<select|data-action="(?:edit|delete)/);
    const key = effectSkillRows(a)[0].key;
    const button = { dataset: { effectSkill: key }, disabled: false };
    await dialog.root.onclick({ target: { closest: () => button } });
    assert.deepEqual(rolls, [key]);
    assert.equal(dialog.rendered, true);
    a.system.rollMode = "disadvantage";
    const previous = dialog.root.innerHTML;
    emit("updateActor", { uuid: "Actor.other" });
    assert.equal(dialog.root.innerHTML, previous);
    emit("updateActor", a);
    assert.match(dialog.root.innerHTML, /title="Neutre"/);
    assert.doesNotMatch(dialog.root.innerHTML, /✔️/);
    a.system.effectRules.named.enabled = false;
    emit("updateItem", { parent: a });
    assert.match(dialog.root.innerHTML, /Aucune compétence sans maîtrise/);
    dialog.close();
    assert.equal(hooks.size, 0);
});

test("an actor has one dialog, unresolved rolls stay disabled, and deletion removes subscriptions", async () => {
    const a = actor("");
    const before = creations;
    const dialog = await openEffectSkillsDialog(a);
    assert.match(dialog.root.innerHTML, /disabled/);
    assert.match(dialog.root.innerHTML, /caractéristique manquante/);
    assert.equal(await openEffectSkillsDialog(a), dialog);
    assert.equal(creations, before + 1);
    assert.equal(dialog.raised, true);
    a.rollEffectSkill = () => assert.fail("An unresolved skill must not roll");
    await dialog.root.onclick({ target: { closest: () => ({ disabled: true }) } });
    emit("deleteActor", a);
    assert.equal(dialog.rendered, false);
    assert.equal(hooks.size, 0);
});

test("adding a skill removes its automatic duplicate immediately and deleting it restores the untrained test", async () => {
    const a = actor();
    const dialog = await openEffectSkillsDialog(a);
    assert.match(dialog.root.innerHTML, /data-effect-skill=/);
    const skill = { id: "owned", type: "skill", name: "DISCRETION <test>", parent: a,
        system: { ability: "dexterity", mastery: 2 } };
    a.items.push(skill);
    emit("createItem", skill);
    assert.match(dialog.root.innerHTML, /Aucune compétence sans maîtrise/);
    assert.doesNotMatch(dialog.root.innerHTML, /data-effect-skill=/);
    a.items.pop();
    emit("deleteItem", skill);
    assert.match(dialog.root.innerHTML, /data-effect-skill=/);
    dialog.close();
    assert.equal(hooks.size, 0);
});
