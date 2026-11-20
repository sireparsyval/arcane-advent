import test from "node:test";
import assert from "node:assert/strict";

class Application {
    async _prepareContext() { return {}; }
    async _onRender() {}
    async _onClose() {}
    render() { this.refreshes = (this.refreshes ?? 0) + 1; }
}
let dialog;
globalThis.foundry = {
    applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: base => base,
        DialogV2: { wait(options) { dialog = options; return Promise.resolve(); } } } },
    utils: { escapeHTML: value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") }
};
const { SceneObjectsPanel, openSceneObjectInteraction } = await import("../module/applications/scene-objects-panel.mjs");
const { sceneObject } = await import("../module/scene-objects.mjs");
const callbacks = new Map();
let serial = 0;
globalThis.Hooks = {
    on(name, callback) { const id = ++serial; callbacks.set(id, { name, callback }); return id; },
    off(_name, id) { callbacks.delete(id); }
};
function tile(id, { movable = false, toggleLight = true, kind = "interactiveElement", hidden = false, levels = ["floor"] } = {}) {
    return {
        id, locked: false, hidden, rotation: 20, levels: new Set(levels), parent: { id: "scene" },
        flags: { "arcane-advent": { sceneObject: { kind, name: id, sourceImage: "image.png",
            sourceUuid: "Item.model", description: "<script>unsafe</script>", light: { enabled: true },
            active: true, movable, toggleLight } } }
    };
}
function setup(entries = []) {
    dialog = undefined; callbacks.clear();
    globalThis.game = { user: { id: "p", isGM: false, viewedScene: "scene", viewedLevel: "floor" },
        i18n: { localize: key => key }, users: { activeGM: { isSelf: false, async query() { return { ok: true }; } } } };
    globalThis.canvas = { scene: { name: "Test", tiles: entries }, level: { id: "floor" }, ready: true };
    globalThis.ui = { notifications: { error(message) { throw Error(message); }, info() {} } };
}

test("interaction dialog offers only allowed actions and escapes descriptive text", async () => {
    setup();
    await openSceneObjectInteraction(tile("Torche"));
    assert.deepEqual(dialog.buttons.map(button => button.action), ["light", "close"]);
    assert.equal(dialog.buttons[0].label, "Éteindre");
    assert.doesNotMatch(dialog.content, /<script>/);
    assert.match(dialog.content, /&lt;script&gt;/);
});

test("locked props remain readable but have no player action buttons", async () => {
    setup();
    const object = tile("Table", { movable: true }); object.locked = true;
    await openSceneObjectInteraction(object);
    assert.deepEqual(dialog.buttons.map(button => button.action), ["close"]);
    assert.match(dialog.content, /verrouillé/);
});

test("unavailable scene props cannot be opened by a player", async () => {
    setup();
    await openSceneObjectInteraction(tile("Secret", { hidden: true }));
    assert.equal(dialog, undefined);
    await openSceneObjectInteraction(tile("Decor", { kind: "sceneryElement", toggleLight: false }));
    assert.equal(dialog, undefined);
});

test("a movable prop offers a nonblocking destination picker and sends the resulting point", async () => {
    setup();
    const events = new Map();
    canvas.stage = { on(name, handler) { events.set(name, handler); }, off(name) { events.delete(name); } };
    globalThis.document = { addEventListener() {}, removeEventListener() {} };
    let request;
    game.users.activeGM.query = async (_name, data) => { request = data; return { ok: true }; };
    await openSceneObjectInteraction(tile("Table", { movable: true }));
    assert.deepEqual(dialog.buttons.map(button => button.action), ["light", "move", "rotate", "close"]);
    assert.equal(dialog.buttons.find(button => button.action === "move").callback(), undefined);
    events.get("pointerdown")({ button: 0, getLocalPosition: () => ({ x: 240, y: 180 }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(request, { action: "move", sceneId: "scene", tileId: "Table", x: 240, y: 180 });
    assert.equal(events.size, 0);
});

test("player panel lists accessible props on the current floor, while GM can also see scenery", async () => {
    const torch = tile("Torch"), table = tile("Table", { movable: true });
    const decor = tile("Decor", { kind: "sceneryElement", toggleLight: false });
    setup([torch, table, decor, tile("Upstairs", { levels: ["other"] }), tile("Secret", { hidden: true })]);
    const panel = new SceneObjectsPanel();
    let context = await panel._prepareContext({});
    assert.deepEqual(context.objects.map(object => object.name), ["Torch", "Table"]);
    assert.equal(context.isGM, false);
    game.user.isGM = true;
    context = await panel._prepareContext({});
    assert.deepEqual(context.objects.map(object => object.name), ["Torch", "Table", "Decor", "Secret"]);
    assert.equal(context.objects.at(-1).status, "Masqué");
    assert.equal(sceneObject(torch).sourceUuid, "Item.model");
});

test("panel subscriptions refresh on scene and object updates and are removed on close", async () => {
    setup();
    const panel = new SceneObjectsPanel();
    await panel._onRender({}, {});
    assert.equal(callbacks.size, 5);
    await panel._onRender({}, {});
    assert.equal(callbacks.size, 5);
    for (const { callback } of callbacks.values()) callback();
    assert.equal(panel.refreshes, 5);
    await panel._onClose({});
    assert.equal(callbacks.size, 0);
    await panel._onRender({}, {});
    assert.equal(callbacks.size, 5);
    await panel._onClose({});
});

function prepareProjectDialog() {
    const events = new Map(), requests = [], errors = [];
    setup();
    game.user.isGM = true;
    canvas.scene.id = "scene";
    canvas.stage = { on(name, handler) { events.set(name, handler); }, off(name) { events.delete(name); } };
    globalThis.document = { addEventListener() {}, removeEventListener() {} };
    game.users.activeGM.query = async (_name, data) => { requests.push(data); return { ok: true }; };
    ui.notifications.error = message => errors.push(message);
    return { events, requests, errors };
}
const flushProject = () => new Promise(resolve => setImmediate(resolve));
const clickProject = (events, point) => events.get("pointerdown")({ button: 0, getLocalPosition: () => point });

test("GM projection dialog closes before picking A and B, and sends the selected duration", async () => {
    const env = prepareProjectDialog();
    await openSceneObjectInteraction(tile("Fireball", { kind: "visualEffect" }));
    assert.match(dialog.content, /name="projectileDuration"/);
    dialog.element = { querySelector: () => ({ value: "1.2" }) };
    assert.equal(dialog.buttons.find(button => button.action === "project").callback(null, null, dialog), undefined);
    clickProject(env.events, { x: 120, y: 160 });
    await flushProject();
    clickProject(env.events, { x: 500, y: 400 });
    await flushProject();
    assert.deepEqual(env.requests, [{ sceneId: "scene", tileId: "Fireball", action: "project",
        from: { x: 120, y: 160 }, to: { x: 500, y: 400 }, duration: 1.2 }]);
    assert.equal(env.events.size, 0);
});

test("cancelling either projectile point leaves the scene unchanged", async () => {
    for (const secondPoint of [false, true]) {
        const env = prepareProjectDialog();
        await openSceneObjectInteraction(tile("Fireball", { kind: "visualEffect" }));
        dialog.element = { querySelector: () => ({ value: "0.8" }) };
        dialog.buttons.find(button => button.action === "project").callback(null, null, dialog);
        if (secondPoint) {
            clickProject(env.events, { x: 100, y: 100 });
            await flushProject();
        }
        env.events.get("pointerdown")({ button: 2 });
        await flushProject();
        assert.equal(env.requests.length, 0);
        assert.equal(env.events.size, 0);
    }
});

test("changing scene or an invalid duration prevents projection", async () => {
    const env = prepareProjectDialog();
    await openSceneObjectInteraction(tile("Fireball", { kind: "visualEffect" }));
    dialog.element = { querySelector: () => ({ value: "50" }) };
    dialog.buttons.find(button => button.action === "project").callback(null, null, dialog);
    assert.equal(env.events.size, 0);
    assert.equal(env.errors.length, 1);
    dialog.element = { querySelector: () => ({ value: "0.8" }) };
    dialog.buttons.find(button => button.action === "project").callback(null, null, dialog);
    clickProject(env.events, { x: 100, y: 100 });
    await flushProject();
    canvas.scene = { id: "other" };
    clickProject(env.events, { x: 200, y: 200 });
    await flushProject();
    assert.equal(env.requests.length, 0);
    assert.match(env.errors.at(-1), /scène ou l’étage a changé/);
});
