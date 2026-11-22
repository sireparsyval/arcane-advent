import test from "node:test";
import assert from "node:assert/strict";
import { renderGroundTokenHUD, registerGroundTokenHUD } from "../module/token-ground-hud.mjs";

class Items extends Map {
    [Symbol.iterator]() { return this.values(); }
    some(callback) { return [...this.values()].some(callback); }
}
class Element {
    children = []; dataset = {}; attributes = {}; listeners = {};
    append(...nodes) {
        for (const node of nodes) {
            if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
            node.parent = this; this.children.push(node);
        }
    }
    after(node) {
        if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
        node.parent = this.parent;
        this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node);
    }
    replaceChildren(...nodes) { this.children.forEach(node => node.parent = null); this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
}

function environment(type = "storage", entries = [], system = { ground: true }) {
    const source = { uuid: "Actor.source", type, system, items: new Items(entries.map(item => [item.id, item])),
        testUserPermission: () => true, getFlag: () => false };
    const scene = { id: "scene", tokens: new Items() };
    const token = { id: "token", uuid: "Scene.scene.Token.token", documentName: "Token", actor: source, parent: scene };
    scene.tokens.set(token.id, token);
    const hooks = new Map();
    globalThis.game = { user: { isGM: true, targets: new Set() }, scenes: new Map([[scene.id, scene]]) };
    globalThis.canvas = { scene, regions: {}, controls: { ruler: {} } };
    globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
    const left = new Element(), right = new Element(), eye = new Element(), elevation = new Element(), native = new Element(), lock = new Element();
    left.append(elevation, lock); right.append(eye, native);
    const root = {
        ownerDocument: { createElement: () => new Element() },
        querySelector: selector => ({ '[data-action="visibility"]': eye, ".col.left .elevation": elevation, ".col.right": right }[selector]),
        querySelectorAll: () => [lock]
    };
    const app = { document: token, object: { isOwner: true }, render() {}, close() {} };
    return { source, token, left, right, eye, elevation, native, lock, root, app, hooks };
}
const item = (id, type = "object", system = {}) => ({ id, name: id, type, system: { quantity: 1, containerId: null, ...system } });

test("all tokens move their existing visibility control directly below elevation; character actions stay unchanged", () => {
    for (const type of ["character", "npc"]) {
        const env = environment(type);
        renderGroundTokenHUD(env.app, env.root);
        assert.deepEqual(env.left.children, [env.elevation, env.eye, env.lock]);
        assert.deepEqual(env.right.children, [env.native]);
    }
});

test("ground HUD replaces native character actions with the actions appropriate to each inventory", () => {
    for (const [entries, expected] of [
        [[item("sword", "weapon")], ["equip", "take"]],
        [[item("apple")], ["take"]],
        [[item("apples", "object", { quantity: 4 })], ["take", "takePart", "split"]],
        [[item("purse", "purse", { coins: { copper: 2 } })], ["take", "coinsAll", "coinsPart", "coinsDrop"]],
        [[item("bag", "container"), item("apple", "object", { containerId: "bag" })], ["takeStorage", "contents", "selection", "dropSelection"]]
    ]) {
        const env = environment("storage", entries);
        renderGroundTokenHUD(env.app, env.root);
        assert.deepEqual(env.right.children.map(button => button.dataset.groundAction), expected);
        assert.ok(env.right.children.every(button => button.type === "button" && button.attributes["aria-label"] && !button.disabled));
        assert.equal(env.eye.parent, env.left);
    }
});

test("empty purses and empty fixed containers retain the proper controls with inapplicable actions disabled", () => {
    const purse = environment("storage", [item("purse", "purse", { coins: {} })]);
    renderGroundTokenHUD(purse.app, purse.root);
    assert.deepEqual(purse.right.children.map(button => !!button.disabled), [false, true, true, true]);
    const fixed = environment("storage", [item("bag", "container", { fixedOnScene: true })]);
    renderGroundTokenHUD(fixed.app, fixed.root);
    assert.deepEqual(fixed.right.children.map(button => button.dataset.groundAction), ["contents", "selection", "dropSelection"]);
    assert.ok(fixed.right.children.every(button => button.disabled));
});

test("an observer may use an open ground HUD but cannot edit native elevation or configuration controls", () => {
    const env = environment("storage", [item("apple")]);
    game.user = { viewedScene: "scene" }; env.app.object.isOwner = false;
    renderGroundTokenHUD(env.app, env.root);
    assert.equal(env.lock.disabled, true);
    assert.equal(env.right.children[0].disabled, false);
    env.source.system.locked = true;
    renderGroundTokenHUD(env.app, env.root);
    assert.equal(env.right.children[0].disabled, true);
});

test("accessible storage observers can open the HUD without changing character permissions or native canvas guards", () => {
    const env = environment("storage", [item("apple")]);
    class Token { _canHUD(user) { return !!user.isGM; } }
    globalThis.CONFIG = { Token: { objectClass: Token }, Canvas: { rulerClass: { canMeasure: false } } };
    registerGroundTokenHUD();
    const token = Object.assign(new Token(), { document: env.token, layer: { active: true } });
    const user = { viewedScene: "scene" };
    assert.equal(token._canHUD(user, { type: "pointerdown" }), true);
    token.layer.active = false; assert.equal(token._canHUD(user), false); token.layer.active = true;
    canvas.controls.ruler.active = true; assert.equal(token._canHUD(user), false); canvas.controls.ruler.active = false;
    canvas.regions._placementContext = {}; assert.equal(token._canHUD(user), false); canvas.regions._placementContext = null;
    token.layer._draggedToken = {}; assert.equal(token._canHUD(user), false); token.layer._draggedToken = null;
    CONFIG.Canvas.rulerClass.canMeasure = true; assert.equal(token._canHUD(user, { type: "pointerdown" }), false);
    CONFIG.Canvas.rulerClass.canMeasure = false;
    env.source.system.locked = true; assert.equal(token._canHUD(user), false);
    env.source.type = "character"; assert.equal(token._canHUD(user), false); assert.equal(token._canHUD({ isGM: true }), true);
});

test("pickup handles a HUD unbound automatically by token deletion without refreshing another token", async () => {
    const env = environment("storage", [item("apple")]);
    const recipient = { documentName: "Token", parent: env.token.parent, uuid: "Scene.scene.Token.other", actor: { type: "character", uuid: "Actor.other" } };
    game.user.targets.add({ document: recipient });
    game.users = { activeGM: { async query() { env.app.document = null; return { count: 1 }; } } };
    globalThis.foundry = { utils: { randomID: () => "request" } };
    globalThis.ui = { notifications: { info() {}, error(message) { assert.fail(message); } } };
    env.app.render = env.app.close = () => assert.fail("The unbound HUD must stay closed");
    renderGroundTokenHUD(env.app, env.root);
    await env.right.children[0].listeners.click({ preventDefault() {}, stopPropagation() {} });
});
