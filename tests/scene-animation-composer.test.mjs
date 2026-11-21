import test from "node:test";
import assert from "node:assert/strict";
import { prepareSceneAnimation, prepareSceneTransition } from "../module/applications/scene-animation-composer.mjs";
import { chooseAnimationPath } from "../module/scene-animation-path.mjs";

const flush = () => new Promise(resolve => setImmediate(resolve));
const draft = { duration: 1.2, arrival: "keep", finalEffectUuid: "", finalMode: "once-delete", finalDuration: 1, decision: "launch" };
function setup() {
    const dialogs = [], replies = [], requests = [], view = new Map(), keys = new Map(), hooks = new Map(), graphics = [];
    class Graphics {
        constructor() { this.destroyed = false; graphics.push(this); }
        clear() { return this; } lineStyle() { return this; } moveTo() { return this; } lineTo() { return this; }
        beginFill() { return this; } drawCircle() { return this; } endFill() { return this; }
        destroy() { this.destroyed = true; }
    }
    globalThis.PIXI = { Graphics };
    globalThis.Hooks = { on(name, fn) { hooks.set(name, fn); return name; }, off(name) { hooks.delete(name); } };
    globalThis.document = { addEventListener(name, fn) { keys.set(name, fn); }, removeEventListener(name) { keys.delete(name); } };
    globalThis.foundry = {
        utils: { escapeHTML: value => value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;") },
        applications: { api: { DialogV2: { wait(options) { dialogs.push(options); return new Promise(resolve => replies.push(resolve)); } } } }
    };
    globalThis.canvas = { ready: true, scene: { id: "scene", grid: { size: 100, distance: 1, units: "m" } }, level: { id: "floor" },
        stage: {}, interface: { addChild() {} }, app: { view: {
            addEventListener(name, fn) { view.set(name, fn); }, removeEventListener(name) { view.delete(name); }
        } }, canvasCoordinatesFromClient: p => p };
    const item = { type: "visualEffect", uuid: "Item.ball", name: "Boule", system: { projectileDuration: 0.8 } };
    globalThis.game = { user: { isGM: true }, items: [item, { type: "visualEffect", uuid: "Item.blast", name: "Explosion" }],
        users: { activeGM: { isSelf: false, async query(_channel, data) { requests.push(data); return { ok: true, tileId: "placed" }; } } } };
    globalThis.ui = { notifications: { info() {}, warn() {} } };
    const click = (x, y, ctrlKey = false, button = 0) => view.get("pointerdown")({
        clientX: x, clientY: y, ctrlKey, button, preventDefault() {}, stopPropagation() {}
    });
    const reply = value => replies.shift()(value);
    const tile = { id: "held", x: 300, y: 400, parent: { id: "scene" },
        flags: { "arcane-advent": { sceneObject: { kind: "visualEffect", name: "Boule", projectileDuration: 0.8 } } } };
    return { dialogs, requests, view, keys, hooks, graphics, click, reply, item, tile };
}
async function trace(env) {
    env.click(100, 100); env.click(200, 100, true); env.click(400, 300);
    await flush();
}

test("arrival selection reveals and enables final-effect settings only when needed", async () => {
    const env = setup(), pending = prepareSceneAnimation({ item: env.item });
    assert.match(env.dialogs[0].content, /<fieldset data-final-options hidden disabled>/);
    let onChange;
    const arrival = { value: "keep", addEventListener(_name, fn) { onChange = fn; } };
    const final = { hidden: true, disabled: true };
    env.dialogs[0].render(null, { element: { querySelector(selector) {
        return selector === '[name="arrival"]' ? arrival : selector === '[data-final-options]' ? final : null;
    } } });
    arrival.value = "replace"; onChange();
    assert.equal(final.hidden, false); assert.equal(final.disabled, false);
    arrival.value = "delete"; onChange();
    assert.equal(final.hidden, true); assert.equal(final.disabled, true);
    env.reply(null); await pending;
    const impact = prepareSceneTransition(env.tile);
    assert.match(env.dialogs.at(-1).content, /<fieldset data-final-options>/);
    env.reply(null); await impact;
});

test("the visual effect's saved preset populates preparation and stays unchanged after a one-off adjustment", async () => {
    const env = setup();
    env.item.system.animation = { arrival: "replace", finalEffectUuid: "Item.blast", finalMode: "once-keep",
        finalDuration: 3, initialSize: 50, finalSize: 200, spin: 180 };
    const original = structuredClone(env.item.system);
    const pending = prepareSceneAnimation({ item: env.item });
    const html = env.dialogs[0].content;
    assert.match(html, /value="replace" selected/); assert.match(html, /value="Item.blast" selected/);
    assert.match(html, /value="once-keep" selected/);
    assert.match(html, /name="initialSize"[^>]*value="50"/);
    assert.match(html, /name="finalSize"[^>]*value="200"/);
    assert.match(html, /name="spin"[^>]*value="180"/);
    env.reply({ ...draft, ...original.animation, spin: 90 }); await flush(); await trace(env);
    await pending;
    assert.equal(env.requests[0].spin, 90);
    assert.equal(env.requests[0].finalMode, "once-keep");
    assert.deepEqual(env.item.system, original);
});

test("preparation launches as soon as the route is complete, preserving Ctrl waypoints", async () => {
    const env=setup(),pending=prepareSceneAnimation({item:env.item});
    env.reply({...draft,arrival:"replace",finalEffectUuid:"Item.blast"});await flush();
    assert.equal(env.requests.length,0);
    await trace(env);await pending;
    assert.equal(env.dialogs.length,1);assert.equal(env.requests.length,1);
    assert.equal(env.requests[0].action,"launch");assert.equal(env.requests[0].finalEffectUuid,"Item.blast");
    assert.deepEqual(env.requests[0].points,[{x:100,y:100},{x:200,y:100},{x:400,y:300}]);
    assert.equal(env.graphics[0].destroyed,true);
});
test("quick launch uses saved parameters without opening a dialog", async () => {
    const env=setup();env.item.system.animation={arrival:"delete",spin:90};
    const pending=prepareSceneAnimation({item:env.item,quick:true});
    assert.equal(env.dialogs.length,0);await trace(env);await pending;
    assert.equal(env.requests[0].arrival,"delete");assert.equal(env.requests[0].spin,90);
});
test("cancel at configuration or during tracing never creates an effect", async () => {
    for(const phase of ["configuration","trace"]){
        const env=setup(),pending=prepareSceneAnimation({item:env.item});
        if(phase==="configuration")env.reply(null);
        else{env.reply({...draft});await flush();env.keys.get("keydown")({key:"Escape",preventDefault(){},stopPropagation(){}});}
        await pending;assert.equal(env.requests.length,0);assert.equal(env.view.size,0);
    }
});
test("a held effect continues directly from its current position", async () => {
    const env=setup(),pending=prepareSceneAnimation({tile:env.tile});
    env.reply({...draft});await flush();env.click(600,500);await pending;
    assert.deepEqual(env.requests[0].points,[{x:300,y:400},{x:600,y:500}]);assert.equal(env.requests[0].action,"continue");
});

test("manual impact asks for a final effect and can cancel without changing the held projectile", async () => {
    const env = setup(), pending = prepareSceneTransition(env.tile);
    assert.match(env.dialogs[0].content, /Une lecture, puis supprimer/);
    assert.match(env.dialogs[0].content, /Une lecture, puis conserver/);
    assert.match(env.dialogs[0].content, /Lire en boucle et conserver/);
    env.reply({ ...draft, finalEffectUuid: "Item.blast", finalMode: "once-delete" });
    await pending;
    assert.equal(env.requests[0].action, "transition");
    assert.equal(env.requests[0].tileId, "held");
    const cancelled = prepareSceneTransition(env.tile); env.reply(null); await cancelled;
    assert.equal(env.requests.length, 1);
});

test("changing scene while tracing aborts launch and cleans the preview", async () => {
    const env=setup(),pending=prepareSceneAnimation({item:env.item});
    env.reply({...draft});await flush();env.click(100,100);canvas.scene={id:"other"};env.click(200,200);
    await assert.rejects(pending,/scène ou l’étage a changé/);assert.equal(env.requests.length,0);assert.equal(env.graphics[0].destroyed,true);
});

test("route controls allow undoing an intermediate step and cancel on right click", async () => {
    const env = setup(), pending = chooseAnimationPath();
    env.click(10, 20); env.click(50, 50, true);
    env.keys.get("keydown")({ key: "Backspace", preventDefault() {}, stopPropagation() {} });
    env.click(100, 200);
    const route = await pending;
    assert.deepEqual(route.points, [{x:10,y:20},{x:100,y:200}]);
    assert.equal(env.view.size, 0);
    route.cleanup(); assert.equal(env.graphics[0].destroyed, true);
    const cancelled = chooseAnimationPath({ start: {x:10,y:20} });
    env.click(0, 0, false, 2);
    assert.equal(await cancelled, null);
    assert.equal(env.graphics[1].destroyed, true);
});

test("scene teardown cancels an unfinished route", async () => {
    const env = setup(), pending = chooseAnimationPath();
    env.click(10, 10);
    env.hooks.get("canvasTearDown")();
    assert.equal(await pending, null);
    assert.equal(env.view.size, 0);
});

test("the native Cancel button resolves falsy instead of falling back to its action name", async () => {
    const env = setup(), pending = prepareSceneAnimation({ item: env.item });
    const button = env.dialogs[0].buttons.find(button => button.action === "cancel");
    const nativeResult = await button.callback() ?? button.action;
    env.reply(nativeResult);
    await pending;
    assert.equal(env.view.size, 0);
    assert.equal(env.requests.length, 0);
});
