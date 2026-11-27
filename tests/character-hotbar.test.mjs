import test from "node:test";
import assert from "node:assert/strict";
import { assignCapturedHotbarMacro, assignCharacterMacro, characterHotbarSlots, clearCharacterHotbar,
    createCharacterHotbarUserClass, registerCharacterHotbars, selectedHotbarActor, syncCharacterHotbarPermissions } from "../module/character-hotbar.mjs";

class NativeUser {
    constructor(id) { this.id = id; this.mode = true; this.hotbar = { 1: "normal" }; this.nativeWrites = []; }
    getFlag() { return this.mode; }
    getHotbarMacros(page = 1) { return [{ slot: (page - 1) * 10 + 1, macro: { id: "normal" } }]; }
    async assignHotbarMacro(macro, slot) { this.nativeWrites.push([macro, slot]); return this; }
}
const User = createCharacterHotbarUserClass(NativeUser);
function actor(uuid) {
    const slots = {}, writes = [];
    return { uuid, name: uuid, type: "character", isOwner: true, ownership: { default: 0, player: 3, observer: 2 }, writes,
        getFlag: () => ({ slots }), async update(changes) {
            writes.push(changes);
            for (const [path, value] of Object.entries(changes)) {
                const key = path.split(".").at(-1);
                if (key.startsWith("-=")) delete slots[key.slice(2)]; else slots[key] = value;
            }
        } };
}
function fixture() {
    const a = actor("Actor.a"), b = actor("Actor.b"), user = new User("gm"), player = new User("player");
    const macro = { id: "m", documentName: "Macro", isOwner: true, ownership: { default: 0, gm: 3 },
        async update(data) { this.ownership = data.ownership; } };
    globalThis.game = { user, macros: new Map([["m", macro]]), users: { activeGM: { isSelf: true } } };
    globalThis.canvas = { ready: true, tokens: { controlled: [{ actor: a }] } };
    globalThis.ui = { hotbar: { render() {} }, notifications: { error() {} } };
    return { a, b, user, player, macro };
}

test("le mode exige exactement un personnage contrôlé et préserve la barre habituelle", () => {
    const { a, user } = fixture();
    assert.equal(selectedHotbarActor(), a);
    assert.equal(user.getHotbarMacros().length, 10);
    for (const controlled of [[], [{ actor: a }, { actor: a }], [{ actor: { ...a, type: "storage" } }], [{ actor: { ...a, isOwner: false } }]]) {
        canvas.tokens.controlled = controlled;
        assert.equal(selectedHotbarActor(), null);
        assert.equal(user.getHotbarMacros()[0].macro.id, "normal");
    }
    canvas.tokens.controlled = [{ actor: a }]; user.mode = false;
    assert.equal(selectedHotbarActor(), null);
    user.mode = true; canvas.ready = false;
    assert.equal(selectedHotbarActor(), null);
    assert.deepEqual(user.hotbar, { 1: "normal" });
});

test("MJ et joueur retrouvent les mêmes cinquante emplacements du personnage", async () => {
    const { a, b, user, player, macro } = fixture();
    await user.assignHotbarMacro(macro, 1);
    await user.assignHotbarMacro(macro, 50);
    assert.equal(user.getHotbarMacros(5).at(-1).macro, macro);
    game.user = player;
    assert.equal(player.getHotbarMacros()[0].macro, macro);
    await player.assignHotbarMacro(null, 1);
    assert.equal(characterHotbarSlots(a)[1], undefined);
    game.user = user;
    assert.equal(user.getHotbarMacros()[0].macro, null);
    canvas.tokens.controlled = [{ actor: b }];
    assert.equal(user.getHotbarMacros(5).at(-1).macro, null);
    assert.deepEqual(user.hotbar, { 1: "normal" }); assert.deepEqual(player.hotbar, { 1: "normal" });
    assert.equal(macro.ownership.player, 1); assert.equal(macro.ownership.observer, undefined);
});

test("déplacer, retirer et vider les raccourcis ne supprime pas les macros ou l’autre barre", async () => {
    const { a, b, user, macro } = fixture();
    await user.assignHotbarMacro(macro, 1);
    await user.assignHotbarMacro(macro, 2, { fromSlot: 1 });
    assert.deepEqual(characterHotbarSlots(a), { 2: "m" });
    await assignCharacterMacro(b, macro, 3);
    await clearCharacterHotbar(a);
    assert.deepEqual(characterHotbarSlots(a), {});
    assert.deepEqual(characterHotbarSlots(b), { 3: "m" });
    assert.equal(game.macros.has("m"), true);
    user.mode = false; await user.assignHotbarMacro(macro, 4);
    assert.equal(user.nativeWrites.length, 1);
});

test("un dépôt asynchrone garde sa destination d’origine même si la sélection et le mode changent", async () => {
    const { a, b, user, macro } = fixture();
    const target = selectedHotbarActor(); canvas.tokens.controlled = [{ actor: b }]; user.mode = false;
    await assignCapturedHotbarMacro(user, target, macro, 3);
    assert.deepEqual(characterHotbarSlots(a), { 3: "m" });
    assert.deepEqual(characterHotbarSlots(b), {});
    user.mode = true;
    await assignCapturedHotbarMacro(user, null, macro, 4);
    assert.equal(user.nativeWrites.length, 1);
    assert.deepEqual(characterHotbarSlots(b), {});
});

test("deux éditions proches conservent leurs slots et les erreurs n’empêchent pas la reprise", async () => {
    const { a, macro } = fixture();
    await Promise.all([assignCharacterMacro(a, macro, 1), assignCharacterMacro(a, macro, 2)]);
    assert.deepEqual(characterHotbarSlots(a), { 1: "m", 2: "m" });
    for (const slot of [0, 51, -1, "bad"]) await assert.rejects(assignCharacterMacro(a, macro, slot));
    a.isOwner = false; await assert.rejects(assignCharacterMacro(a, macro, 3));
    a.isOwner = true; await assignCharacterMacro(a, macro, 3);
    assert.deepEqual(characterHotbarSlots(a), { 1: "m", 2: "m", 3: "m" });
});

test("déposer sur un emplacement occupé échange les macros comme la barre native", async () => {
    const { a, user, macro } = fixture();
    const other = { id: "second" };
    await user.assignHotbarMacro(macro, 1); await user.assignHotbarMacro(other, 2);
    await user.assignHotbarMacro(macro, 2, { fromSlot: 1 });
    assert.deepEqual(characterHotbarSlots(a), { 1: "second", 2: "m" });
});

test("les nouveaux propriétaires reçoivent le droit d’exécuter les macros partagées", async () => {
    const { a, macro } = fixture();
    await assignCharacterMacro(a, macro, 1);
    a.ownership.second = 3;
    await syncCharacterHotbarPermissions(a);
    assert.equal(macro.ownership.second, 1);
    assert.equal(macro.ownership.default, 0);
});

test("les hooks capturent les macros avant une résolution asynchrone sans détourner la barre normale", async () => {
    const { a, b, user, macro } = fixture(), hooks = new Map();
    globalThis.Hooks = { on(name, callback) { const list = hooks.get(name) ?? []; list.push(callback); hooks.set(name, list); } };
    globalThis.CONFIG = { User: { documentClass: NativeUser }, ui: { hotbar: class { static DEFAULT_OPTIONS = { actions: {} }; } } };
    let resolveMacro; globalThis.fromUuid = () => new Promise(resolve => { resolveMacro = resolve; });
    registerCharacterHotbars();
    const drop = hooks.get("hotbarDrop")[0];
    assert.equal(drop({}, { type: "Macro", uuid: "Macro.m" }, 5), false);
    canvas.tokens.controlled = [{ actor: b }]; resolveMacro(macro);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(characterHotbarSlots(a)[5], "m");
    assert.deepEqual(characterHotbarSlots(b), {});
    user.mode = false;
    assert.equal(drop({}, { type: "Macro", uuid: "Macro.m" }, 6), undefined);
    assert.equal(hooks.get("renderHotbar").length, 1);
});

test("une macro créée depuis un slot vide conserve sa destination jusqu’à l’enregistrement", async () => {
    const { a, b, user } = fixture(), hooks = new Map();
    let temporary;
    class Macro {
        static defaultName() { return "Macro"; }
        constructor(data) { this.data = data; temporary = this; this.sheet = { render: async () => {} }; }
    }
    class Hotbar { static DEFAULT_OPTIONS = { actions: { execute() {} } }; }
    globalThis.Hooks = { on(name, callback) { const list = hooks.get(name) ?? []; list.push(callback); hooks.set(name, list); } };
    globalThis.CONFIG = { User: { documentClass: NativeUser }, Macro: { documentClass: Macro }, ui: { hotbar: Hotbar } };
    globalThis.foundry = { documents: { Macro } };
    globalThis.fromUuid = async uuid => uuid === a.uuid ? a : b;
    registerCharacterHotbars();
    const Bar = CONFIG.ui.hotbar;
    const entry = { dataset: { slot: "3" }, closest() { return this; } };
    await Bar.DEFAULT_OPTIONS.actions.execute.call(new Bar(), { target: entry });
    const destination = temporary.data.flags["arcane-advent"].characterHotbarDestination;
    assert.equal(destination.actorUuid, a.uuid);
    canvas.tokens.controlled = [{ actor: b }]; user.mode = false;
    const macro = { id: "new", getFlag: () => destination, async unsetFlag() {} };
    hooks.get("createMacro")[0](macro, {}, user.id);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(characterHotbarSlots(a)[3], "new");
    assert.deepEqual(characterHotbarSlots(b), {});
    await Bar.DEFAULT_OPTIONS.actions.execute.call(new Bar(), { target: entry });
    const normalDestination = temporary.data.flags["arcane-advent"].characterHotbarDestination;
    assert.equal(normalDestination.actorUuid, null);
    user.mode = true;
    hooks.get("createMacro")[0]({ ...macro, getFlag: () => normalDestination }, {}, user.id);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(user.nativeWrites.length, 1);
    assert.deepEqual(characterHotbarSlots(b), {});
});
