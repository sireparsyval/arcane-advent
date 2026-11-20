import test from "node:test";
import assert from "node:assert/strict";
import { projectileFrame, sceneObjectPosition, sceneObjectFlight, registerSceneProjectiles } from "../module/scene-projectiles.mjs";
import { processSceneObjectAction, chooseSceneObjectPosition } from "../module/scene-objects.mjs";

class Collection extends Map { [Symbol.iterator]() { return this.values(); } }
const motion = () => ({ id: "flight", from: { x: 100, y: 200 }, to: { x: 500, y: 400 }, startedAt: 1000, duration: 800 });
const position = () => ({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } });

test("projectiles stay at A before launch, interpolate at constant speed, and stop at B", () => {
    const flight = motion();
    assert.deepEqual(projectileFrame(flight, 500), { x: 100, y: 200, progress: 0, done: false });
    assert.deepEqual(projectileFrame(flight, 1400), { x: 300, y: 300, progress: 0.5, done: false });
    assert.deepEqual(projectileFrame(flight, 2200), { x: 500, y: 400, progress: 1, done: true });
});

test("late viewers use the shared launch time and invalid trajectories never animate", () => {
    globalThis.game = { time: { serverTime: 1600 } };
    const tile = { x: 500, y: 400, flags: { "arcane-advent": { sceneObject: { kind: "visualEffect", flight: motion() } } } };
    assert.deepEqual(sceneObjectPosition(tile), { x: 400, y: 350 });
    tile.x = 600;
    assert.equal(sceneObjectFlight(tile), null);
    assert.deepEqual(sceneObjectPosition(tile), { x: 600, y: 400 });
    for (const bad of [{ ...motion(), duration: 0 }, { ...motion(), duration: Infinity }, { ...motion(), to: { x: NaN, y: 0 } }]) {
        assert.equal(projectileFrame(bad), null);
    }
});

function setupRuntime() {
    const callbacks = new Map(), ticks = new Set(), painted = [];
    globalThis.Hooks = {
        on(name, handler) { callbacks.set(name, handler); return name; },
        callAll(name, tile, point) { painted.push({ name, id: tile.id, ...point }); }
    };
    globalThis.PIXI = { UPDATE_PRIORITY: { LOW: -25 } };
    globalThis.game = { time: { serverTime: 1000 } };
    const scene = { id: "scene", tiles: new Collection(), lights: [], regions: [] };
    const display = { position: position() };
    const tile = {
        id: "effect", x: 500, y: 400, parent: scene, levels: new Set(["floor"]), hidden: false,
        flags: { "arcane-advent": { sceneObject: { kind: "visualEffect", flight: motion() } } },
        object: { mesh: display, controls: { shape: { updateSource(point) { this.point = point; } }, refresh() {} } }
    };
    scene.tiles.set(tile.id, tile);
    const lightDoc = { x: 500, y: 400, flags: { "arcane-advent": { sceneObjectParent: tile.id } } };
    class NativeLight {
        constructor() { this.document = lightDoc; this.samples = []; }
        _getLightSourceData() { return { x: this.document.x, y: this.document.y, seed: 42 }; }
        initializeLightSource() { this.samples.push(this._getLightSourceData()); }
    }
    lightDoc.object = new NativeLight();
    scene.lights.push(lightDoc);
    const region = { flags: { "arcane-advent": { sceneObjectParent: tile.id } },
        shapes: [{ x: 500, y: 400 }], object: { position: position() } };
    scene.regions.push(region);
    globalThis.canvas = { ready: true, scene, level: { id: "floor" },
        app: { ticker: { add(fn) { ticks.add(fn); }, remove(fn) { ticks.delete(fn); } } } };
    registerSceneProjectiles();
    return { callbacks, ticks, tile, scene, display, lightDoc, region, painted };
}

test("every animation tick moves media, light and boundary without writing scene documents", () => {
    const env = setupRuntime();
    env.callbacks.get("canvasReady")();
    assert.equal(env.ticks.size, 1);
    assert.deepEqual([env.display.position.x, env.display.position.y], [100, 200]);
    game.time.serverTime = 1400;
    for (const tick of env.ticks) tick();
    assert.deepEqual([env.display.position.x, env.display.position.y], [300, 300]);
    assert.deepEqual(env.lightDoc.object.samples.at(-1), { x: 300, y: 300, seed: 42 });
    assert.deepEqual([env.lightDoc.x, env.lightDoc.y], [500, 400]);
    assert.deepEqual([env.region.object.position.x, env.region.object.position.y], [-200, -100]);
    assert.ok(env.painted.some(point => point.name === "arcaneAdventSceneObjectPosition" && point.x === 300));
    game.time.serverTime = 1800;
    for (const tick of env.ticks) tick();
    assert.equal(env.ticks.size, 0);
    assert.equal(Object.hasOwn(env.lightDoc.object, "_getLightSourceData"), false);
    assert.deepEqual(env.lightDoc.object.samples.at(-1), { x: 500, y: 400, seed: 42 });
    assert.deepEqual([env.region.object.position.x, env.region.object.position.y], [0, 0]);
});

test("a user joining halfway through sees the remaining part without restarting", () => {
    const env = setupRuntime();
    game.time.serverTime = 1400;
    env.callbacks.get("canvasReady")();
    assert.deepEqual([env.display.position.x, env.display.position.y], [300, 300]);
    env.callbacks.get("canvasTearDown")();
    assert.equal(env.ticks.size, 0);
});

test("repeated updates keep one ticker, replacement flights interrupt cleanly, and deletion cleans up", () => {
    const env = setupRuntime();
    env.callbacks.get("canvasReady")();
    env.callbacks.get("updateTile")(env.tile);
    assert.equal(env.ticks.size, 1);
    env.tile.x = 800; env.tile.y = 600;
    env.tile.flags["arcane-advent"].sceneObject.flight = {
        ...motion(), id: "second", from: { x: 300, y: 300 }, to: { x: 800, y: 600 }
    };
    env.callbacks.get("updateTile")(env.tile);
    assert.equal(env.ticks.size, 1);
    assert.deepEqual([env.display.position.x, env.display.position.y], [300, 300]);
    env.scene.tiles.delete(env.tile.id);
    env.callbacks.get("deleteTile")(env.tile);
    assert.equal(env.ticks.size, 0);
    assert.equal(Object.hasOwn(env.lightDoc.object, "_getLightSourceData"), false);
});

test("hidden objects and a different floor do not run an animation", () => {
    const env = setupRuntime();
    env.tile.hidden = true;
    env.callbacks.get("canvasReady")();
    assert.equal(env.ticks.size, 0);
    env.tile.hidden = false; canvas.level.id = "other";
    env.callbacks.get("updateTile")(env.tile);
    assert.equal(env.ticks.size, 0);
    canvas.level.id = "floor";
    env.callbacks.get("updateTile")(env.tile);
    assert.equal(env.ticks.size, 1);
    env.tile.hidden = true;
    env.callbacks.get("updateTile")(env.tile);
    assert.equal(env.ticks.size, 0);
});

function setupService() {
    const updates = [], embedded = [];
    const scene = { id: "scene", width: 2000, height: 2000, grid: { size: 100, distance: 1 },
        tiles: new Collection(), lights: [], regions: [{ id: "region", flags: { "arcane-advent": { sceneObjectParent: "effect" } } }],
        async updateEmbeddedDocuments(type, data) { embedded.push({ type, data }); } };
    const model = { name: "Fireball", kind: "visualEffect", active: true, mist: { enabled: false },
        light: { enabled: false, color: "#ffffff" } };
    const tile = { id: "effect", x: 500, y: 500, width: 200, height: 200, elevation: 0, parent: scene, levels: new Set(),
        flags: { "arcane-advent": { sceneObject: model } },
        async update(data) {
            updates.push(data);
            for (const [key, value] of Object.entries(data)) {
                if (key.startsWith("flags.arcane-advent.sceneObject.")) model[key.split(".").at(-1)] = value;
                else this[key] = value;
            }
        } };
    scene.tiles.set(tile.id, tile);
    let serial = 0;
    globalThis.foundry = { utils: { randomID: () => "flight" + ++serial } };
    globalThis.game = { user: { isGM: true }, time: { serverTime: 5000 }, scenes: new Map([[scene.id, scene]]) };
    globalThis.CONST = { REGION_VISIBILITY: { ALWAYS: 1, LAYER_UNLOCKED: 4 } };
    return { scene, tile, model, updates, embedded };
}

test("the GM publishes one bounded flight with a shared start time and persists the arrival immediately", async () => {
    const env = setupService();
    await processSceneObjectAction({ sceneId: "scene", tileId: "effect", action: "project",
        from: { x: 100, y: 200 }, to: { x: 800, y: 600 }, duration: 0.8 }, game.user);
    assert.equal(env.updates.length, 1);
    assert.deepEqual([env.tile.x, env.tile.y, env.tile.hidden], [800, 600, false]);
    assert.deepEqual(env.model.flight, { id: "flight1", from: { x: 100, y: 200 }, to: { x: 800, y: 600 }, startedAt: 5150, duration: 800 });
    assert.equal(env.embedded.length, 1);
    assert.deepEqual(env.embedded[0].data[0].shapes[0], { type: "circle", x: 800, y: 600, radius: 100, gridBased: false });
});

test("projection rejects players, nonvisual props, invalid durations and out-of-scene points before writes", async () => {
    const env = setupService();
    const valid = { sceneId: "scene", tileId: "effect", action: "project", from: { x: 100, y: 200 }, to: { x: 800, y: 600 }, duration: 0.8 };
    await assert.rejects(processSceneObjectAction(valid, { isGM: false, viewedScene: "scene" }), /accessible/);
    for (const duration of [0, -1, NaN, Infinity, 20, "1"]) {
        await assert.rejects(processSceneObjectAction({ ...valid, duration }, game.user), /durée/);
    }
    await assert.rejects(processSceneObjectAction({ ...valid, from: { x: -1, y: 0 } }, game.user), /position/);
    await assert.rejects(processSceneObjectAction({ ...valid, to: valid.from }, game.user), /différents/);
    env.model.kind = "interactiveElement";
    await assert.rejects(processSceneObjectAction(valid, game.user), /autorisée/);
    assert.equal(env.updates.length, 0);
});

test("ordinary movement cancels a previous flight", async () => {
    const env = setupService(); env.model.flight = motion();
    await processSceneObjectAction({ sceneId: "scene", tileId: "effect", action: "move", x: 900, y: 700 }, game.user);
    assert.equal(env.model.flight, null);
    assert.deepEqual([env.tile.x, env.tile.y], [900, 700]);
});

test("point selection captures canvas clicks on tokens, translates client coordinates and removes listeners", async () => {
    const view = new Map(), keys = new Map(), hooks = new Map();
    globalThis.canvas = { ready: true, stage: {},
        app: { view: { addEventListener(name, fn, capture) { assert.equal(capture, true); view.set(name, fn); },
            removeEventListener(name, _fn, capture) { assert.equal(capture, true); view.delete(name); } } },
        canvasCoordinatesFromClient: point => ({ x: point.x * 2 + 100, y: point.y * 2 + 50 }) };
    globalThis.document = { addEventListener(name, fn) { keys.set(name, fn); }, removeEventListener(name) { keys.delete(name); } };
    globalThis.Hooks = { on(name, fn) { hooks.set(name, fn); return name; }, off(name) { hooks.delete(name); } };
    globalThis.ui = { notifications: { info() {} } };
    const pending = chooseSceneObjectPosition("Pick A");
    let prevented = 0;
    view.get("pointerdown")({ button: 0, clientX: 20, clientY: 30, preventDefault() { prevented++; }, stopPropagation() { prevented++; } });
    assert.deepEqual(await pending, { x: 140, y: 110 });
    assert.equal(prevented, 2);
    assert.equal(view.size, 0); assert.equal(keys.size, 0); assert.equal(hooks.size, 0);
    const cancelled = chooseSceneObjectPosition();
    keys.get("keydown")({ key: "Escape" });
    assert.equal(await cancelled, null);
    assert.equal(view.size, 0);
});

test("completed and stale trajectories are cleared by the active GM", async () => {
    const env = setupRuntime(), updates = [];
    game.users = { activeGM: { isSelf: true } };
    env.tile.update = async (changes, options) => {
        updates.push({ changes, options });
        env.tile.flags["arcane-advent"].sceneObject.flight = null;
    };
    env.callbacks.get("canvasReady")();
    game.time.serverTime = 1800;
    for (const tick of env.ticks) tick();
    assert.equal(updates.length, 1);
    assert.equal(env.ticks.size, 0);
    assert.deepEqual(updates[0].changes, { "flags.arcane-advent.sceneObject.flight": null });
    env.tile.flags["arcane-advent"].sceneObject.flight = { ...motion(), id: "old-world", startedAt: 3600000 };
    game.time.serverTime = 1000;
    env.callbacks.get("canvasReady")();
    assert.equal(updates.length, 2);
    assert.equal(env.ticks.size, 0);
    await Promise.resolve();
});
