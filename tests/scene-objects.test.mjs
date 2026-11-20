import test from "node:test";
import assert from "node:assert/strict";
import {
    sceneObjectPlan, sceneObject, sceneObjectChildren, sceneObjectChildData,
    placeSceneObject, syncSceneObject, removeSceneObjectChildren, sceneObjectAccess,
    processSceneObjectAction, requestSceneObjectAction, registerSceneObjects, SCENE_OBJECT_QUERY
} from "../module/scene-objects.mjs";

class Collection extends Map { [Symbol.iterator]() { return this.values(); } }
const clone = value => structuredClone(value);
let serial = 0;
function documentFor(source, parent, type) {
    const data = clone(source);
    const doc = { ...data, id: source._id ?? "doc" + ++serial, parent };
    doc.levels = new Set(source.levels ?? []);
    doc.getFlag = (scope, key) => doc.flags?.[scope]?.[key];
    doc.update = async (changes, options) => {
        parent.calls.push({ type, action: "update", changes: clone(changes), options });
        for (const [key, value] of Object.entries(changes)) {
            if (key.startsWith("flags.")) {
                const parts = key.split(".");
                let target = doc;
                for (const part of parts.slice(0, -1)) target = target[part] ??= {};
                target[parts.at(-1)] = value;
            } else if (key === "levels") doc.levels = new Set(value);
            else doc[key] = clone(value);
        }
        return doc;
    };
    return doc;
}
function setup() {
    const scene = {
        id: "scene", name: "Test", width: 2000, height: 1600, dimensions: { width: 2200, height: 1800 },
        grid: { size: 100, distance: 2 }, tiles: new Collection(), lights: new Collection(), regions: new Collection(),
        calls: [],
        async createEmbeddedDocuments(type, sources) {
            this.calls.push({ type, action: "create" });
            if (this.failCreate === type) throw Error("creation failed");
            const collection = this[{ Tile: "tiles", AmbientLight: "lights", Region: "regions" }[type]];
            return sources.map(source => {
                const doc = documentFor(source, this, type);
                collection.set(doc.id, doc);
                return doc;
            });
        },
        async updateEmbeddedDocuments(type, sources, options) {
            const collection = this[{ AmbientLight: "lights", Region: "regions" }[type]];
            return Promise.all(sources.map(source => collection.get(source._id).update(source, options)));
        },
        async deleteEmbeddedDocuments(type, ids, options) {
            this.calls.push({ type, action: "delete", ids, options });
            const collection = this[{ Tile: "tiles", AmbientLight: "lights", Region: "regions" }[type]];
            for (const id of ids) collection.delete(id);
        }
    };
    globalThis.game = {
        user: { id: "gm", isGM: true, viewedScene: scene.id, viewedLevel: "floor" },
        scenes: new Map([[scene.id, scene]]), users: { activeGM: { isSelf: true } }
    };
    globalThis.canvas = { scene, ready: true, level: { id: "floor" }, stage: { pivot: { x: 600, y: 500 } } };
    globalThis.CONFIG = { Canvas: { lightAnimations: { fog: {}, torch: {} } }, queries: {} };
    globalThis.CONST = { REGION_VISIBILITY: { ALWAYS: 1, LAYER_UNLOCKED: 4 } };
    return scene;
}
function model(type = "visualEffect", overrides = {}) {
    return {
        type, name: "Nuage", uuid: "Item.model", img: "icons/model.svg",
        system: {
            description: "Description", placement: { width: 1, height: 2, radius: 3, image: "", opacity: 1, rotation: 0, elevation: 4 },
            interaction: { movable: false, toggleLight: true },
            light: { enabled: true, initiallyOn: true, dim: 4, bright: 2, color: "#84952f",
                alpha: 0.45, luminosity: 0, animation: "fog", speed: 2, intensity: 5, reverse: false, walls: true },
            mist: { enabled: false }, showBoundary: false, ...overrides
        }
    };
}
const player = () => ({ id: "player", isGM: false, viewedScene: "scene", viewedLevel: "floor" });
const position = { x: 800, y: 700 };

test("3 scene units of radius creates a 6-unit diameter and centered transparent anchor", () => {
    const scene = setup();
    const plan = sceneObjectPlan(model(), scene, position);
    assert.equal(plan.width, 300);
    assert.equal(plan.height, 300);
    assert.deepEqual([plan.x, plan.y, plan.texture.anchorX, plan.texture.anchorY], [800, 700, 0.5, 0.5]);
    assert.match(plan.texture.src, /scene-effect-anchor.svg$/);
    assert.equal(plan.flags["arcane-advent"].sceneObject.light.luminosity, 0);
});

test("props use rectangular dimensions and a separate scene image, with a directory icon fallback", () => {
    const scene = setup(), item = model("sceneryElement");
    let plan = sceneObjectPlan(item, scene, position);
    assert.deepEqual([plan.width, plan.height, plan.texture.src], [50, 100, item.img]);
    item.system.placement.image = "assets/chair.webm";
    plan = sceneObjectPlan(item, scene, position);
    assert.equal(plan.texture.src, "assets/chair.webm");
});

test("placement snapshots are independent of the source model and each other", () => {
    const scene = setup(), item = model();
    const first = sceneObjectPlan(item, scene, position), second = sceneObjectPlan(item, scene, position);
    item.system.light.color = "#ffffff";
    first.flags["arcane-advent"].sceneObject.placement.radius = 99;
    assert.equal(first.flags["arcane-advent"].sceneObject.light.color, "#84952f");
    assert.equal(second.flags["arcane-advent"].sceneObject.placement.radius, 3);
});

test("unsupported models, bad dimensions, bad color and out-of-scene positions are rejected", () => {
    const scene = setup();
    assert.throws(() => sceneObjectPlan(model("weapon"), scene, position), /modèle/);
    assert.throws(() => sceneObjectPlan(model("visualEffect", { placement: { radius: NaN } }), scene, position), /dimensions/);
    const item = model(); item.system.light.color = "red";
    assert.throws(() => sceneObjectPlan(item, scene, position), /couleur/);
    for (const point of [{ x: -1, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: 1801 }]) {
        assert.throws(() => sceneObjectPlan(model(), scene, point), /position/);
    }
});

test("dropping an effect creates linked light and region on the current floor", async () => {
    const scene = setup(), tile = await placeSceneObject(model(), scene, position);
    const { lights, regions } = sceneObjectChildren(tile);
    assert.equal(scene.tiles.size, 1);
    assert.equal(lights.length, 1); assert.equal(regions.length, 1);
    assert.deepEqual([...tile.levels], ["floor"]);
    assert.deepEqual([...lights[0].levels], ["floor"]);
    assert.deepEqual([...regions[0].levels], ["floor"]);
    assert.deepEqual(regions[0].shapes[0], { type: "circle", x: 800, y: 700, radius: 150, gridBased: false });
    assert.equal(lights[0].config.dim, 3);
    assert.equal(lights[0].config.luminosity, 0);
    assert.equal(regions[0].visibility, CONST.REGION_VISIBILITY.LAYER_UNLOCKED);
});

test("moving, resizing, hiding and changing floor keeps light and region synchronized without duplicates", async () => {
    const scene = setup(), tile = await placeSceneObject(model(), scene, position);
    await tile.update({ x: 1111, y: 555, width: 400, height: 400, hidden: true, elevation: 7, levels: ["upstairs"] });
    await Promise.all([syncSceneObject(tile), syncSceneObject(tile)]);
    const { lights, regions } = sceneObjectChildren(tile);
    assert.equal(scene.lights.size, 1); assert.equal(scene.regions.size, 1);
    assert.deepEqual([lights[0].x, lights[0].y, lights[0].elevation, lights[0].hidden], [1111, 555, 7, true]);
    assert.deepEqual([...lights[0].levels], ["upstairs"]);
    assert.equal(lights[0].config.dim, 4);
    assert.deepEqual(regions[0].shapes[0], { type: "circle", x: 1111, y: 555, radius: 200, gridBased: false });
    assert.equal(regions[0].hidden, true);
});

test("ordinary furniture creates neither light nor region unless enabled", async () => {
    const scene = setup(), item = model("sceneryElement");
    item.system.light.enabled = false;
    await placeSceneObject(item, scene, position);
    assert.equal(scene.tiles.size, 1); assert.equal(scene.lights.size, 0); assert.equal(scene.regions.size, 0);
});

test("deleting an anchor removes only its own children and leaves other copies usable", async () => {
    const scene = setup(), first = await placeSceneObject(model(), scene, position);
    const second = await placeSceneObject(model(), scene, { x: 1000, y: 1000 });
    await scene.deleteEmbeddedDocuments("Tile", [first.id]);
    await removeSceneObjectChildren(first);
    await syncSceneObject(first);
    assert.equal(scene.lights.size, 1); assert.equal(scene.regions.size, 1);
    assert.equal(sceneObjectChildren(second).lights.length, 1);
    assert.equal(sceneObjectChildren(second).regions.length, 1);
});

test("a failed child creation rolls back the partial placement", async () => {
    const scene = setup(); scene.failCreate = "Region";
    await assert.rejects(placeSceneObject(model(), scene, position), /creation failed/);
    assert.equal(scene.tiles.size, 0); assert.equal(scene.lights.size, 0); assert.equal(scene.regions.size, 0);
});

test("only the GM can place models", async () => {
    const scene = setup(); game.user = player();
    await assert.rejects(placeSceneObject(model(), scene, position), /MJ/);
    assert.equal(scene.tiles.size, 0);
});

test("players can only interact with exposed props in their scene and level", async () => {
    const scene = setup(), item = model("interactiveElement");
    item.system.interaction.movable = true;
    const tile = await placeSceneObject(item, scene, position);
    assert.deepEqual(sceneObjectAccess(tile, player()), { visible: true, movable: true, toggleLight: true });
    assert.equal(sceneObjectAccess(tile, { ...player(), viewedScene: "other" }).visible, false);
    assert.equal(sceneObjectAccess(tile, { ...player(), viewedLevel: "upstairs" }).visible, false);
    tile.hidden = true;
    assert.equal(sceneObjectAccess(tile, player()).visible, false);
    assert.equal(sceneObjectAccess(tile, game.user).visible, true);
});

test("player actions move and rotate allowed furniture while rejecting arbitrary updates and locked objects", async () => {
    const scene = setup(), item = model("interactiveElement");
    item.system.interaction.movable = true;
    const tile = await placeSceneObject(item, scene, position);
    const data = { sceneId: scene.id, tileId: tile.id };
    await processSceneObjectAction({ ...data, action: "move", x: 123, y: 456, hidden: true }, player());
    assert.deepEqual([tile.x, tile.y, tile.hidden], [123, 456, undefined]);
    await processSceneObjectAction({ ...data, action: "rotate", rotation: -90 }, player());
    assert.equal(tile.rotation, 270);
    await assert.rejects(processSceneObjectAction({ ...data, action: "delete" }, player()), /autorisée/);
    await assert.rejects(processSceneObjectAction({ ...data, action: "move", x: -1, y: 0 }, player()), /position/);
    tile.locked = true;
    await assert.rejects(processSceneObjectAction({ ...data, action: "move", x: 100, y: 100 }, player()), /verrouillé/);
});

test("switching off one torch hides its light without changing another torch or the source model", async () => {
    const scene = setup(), item = model("interactiveElement");
    const first = await placeSceneObject(item, scene, position), second = await placeSceneObject(item, scene, position);
    await processSceneObjectAction({ sceneId: scene.id, tileId: first.id, action: "light", active: false }, player());
    assert.equal(sceneObject(first).active, false);
    assert.equal(sceneObjectChildren(first).lights[0].hidden, true);
    assert.equal(sceneObjectChildren(second).lights[0].hidden, false);
    assert.equal(item.system.light.initiallyOn, true);
    item.system.interaction.toggleLight = false;
    const forbidden = await placeSceneObject(item, scene, position);
    await assert.rejects(processSceneObjectAction({ sceneId: scene.id, tileId: forbidden.id, action: "light", active: false }, player()), /accessible/);
});

test("non-GM clients cannot execute GM-side mutations directly", async () => {
    const scene = setup(), tile = await placeSceneObject(model(), scene, position);
    game.user = player();
    await assert.rejects(processSceneObjectAction({ sceneId: scene.id, tileId: tile.id, action: "light", active: false }, game.user), /MJ/);
});

function register() {
    const hooks = new Map();
    globalThis.Hooks = { on(name, handler) { hooks.set(name, handler); return name; }, off() {} };
    globalThis.ui = { notifications: { error(message) { throw Error(message); } } };
    registerSceneObjects({ openPanel() {}, openInteraction() {} });
    return hooks;
}

test("authenticated queries use the supplied sender permissions rather than forged payload permissions", async () => {
    const scene = setup(), item = model("interactiveElement");
    item.system.interaction.toggleLight = false;
    const tile = await placeSceneObject(item, scene, position);
    register();
    const response = await CONFIG.queries[SCENE_OBJECT_QUERY]({
        sceneId: scene.id, tileId: tile.id, action: "light", active: false, user: { isGM: true }
    }, { user: player() });
    assert.match(response.error, /accessible/);
    assert.equal(sceneObject(tile).active, true);
});

test("client requests target the active GM and preserve trusted object IDs", async () => {
    const scene = setup(), tile = await placeSceneObject(model(), scene, position);
    let sent;
    game.users.activeGM = { isSelf: false, async query(name, data) { sent = { name, data }; return { ok: true }; } };
    await requestSceneObjectAction(tile, "light", { active: false, sceneId: "forged", tileId: "forged", action: "delete" });
    assert.equal(sent.name, SCENE_OBJECT_QUERY);
    assert.deepEqual(sent.data, { active: false, sceneId: scene.id, tileId: tile.id, action: "light" });
    game.users.activeGM = null;
    await assert.rejects(requestSceneObjectAction(tile, "light"), /MJ doit être connecté/);
});

test("dragging an unloaded compendium model resolves asynchronously and uses the original target scene", async () => {
    const scene = setup(), hooks = register();
    globalThis.fromUuid = async uuid => {
        assert.equal(uuid, "Compendium.models.Item.effect");
        return model();
    };
    hooks.get("dropCanvasData")(canvas, { type: "Item", uuid: "Compendium.models.Item.effect", ...position });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(scene.tiles.size, 1);
    assert.equal(scene.regions.size, 1);
});

test("unsupported Items and player drops create no scene documents", async () => {
    const scene = setup(), hooks = register();
    globalThis.fromUuid = async () => model("weapon");
    hooks.get("dropCanvasData")(canvas, { type: "Item", uuid: "Item.weapon", ...position });
    await new Promise(resolve => setImmediate(resolve));
    game.user = player();
    globalThis.fromUuid = () => { throw Error("must not resolve"); };
    hooks.get("dropCanvasData")(canvas, { type: "Item", uuid: "Item.effect", ...position });
    assert.equal(scene.tiles.size, 0);
});

test("GM actions remain available after the source model is removed", async () => {
    const scene = setup(), tile = await placeSceneObject(model(), scene, position);
    const data = { sceneId: scene.id, tileId: tile.id, action: "light", active: false };
    await processSceneObjectAction(data, game.user);
    assert.equal(sceneObjectChildren(tile).lights[0].hidden, true);
    assert.equal(sceneObjectChildData(tile).region.shapes[0].radius, 150);
});

test("native copies of an anchor get their own linked children", async () => {
    const scene = setup(), original = await placeSceneObject(model(), scene, position), hooks = register();
    const source = sceneObjectPlan(model(), scene, { x: 600, y: 400 });
    source.flags = clone(original.flags);
    const [duplicate] = await scene.createEmbeddedDocuments("Tile", [source]);
    hooks.get("createTile")(duplicate, {});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sceneObjectChildren(original).lights.length, 1);
    assert.equal(sceneObjectChildren(duplicate).lights.length, 1);
    assert.equal(sceneObjectChildren(duplicate).regions.length, 1);
    assert.notEqual(sceneObjectChildren(original).lights[0].id, sceneObjectChildren(duplicate).lights[0].id);
});

test("double-clicking a rotated prop opens its actions without intercepting token clicks", async () => {
    const scene = setup(), item = model("interactiveElement"), tile = await placeSceneObject(item, scene, position);
    tile.rotation = 45;
    const events = new Map(), hooks = new Map(), opened = [];
    canvas.stage.on = (name, handler) => events.set(name, handler);
    canvas.stage.off = name => events.delete(name);
    canvas.stage.scale = { x: 1 };
    canvas.tokens = { active: true, placeables: [] };
    globalThis.Hooks = { on(name, handler) { hooks.set(name, handler); }, off() {} };
    registerSceneObjects({ openPanel() {}, openInteraction: target => opened.push(target.id) });
    hooks.get("canvasReady")();
    const event = { button: 0, getLocalPosition: () => ({ ...position }) };
    events.get("pointertap")(event); events.get("pointertap")(event);
    assert.deepEqual(opened, [tile.id]);
    canvas.tokens.placeables = [{ visible: true, bounds: { contains: () => true } }];
    events.get("pointertap")(event); events.get("pointertap")(event);
    assert.deepEqual(opened, [tile.id]);
    hooks.get("canvasTearDown")();
    assert.equal(events.size, 0);
    await new Promise(resolve => setImmediate(resolve));
});
