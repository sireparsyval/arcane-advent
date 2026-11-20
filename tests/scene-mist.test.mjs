import test from "node:test";
import assert from "node:assert/strict";
import { MIST_DEFAULTS, sceneMist, sceneLightEnabled, migrateVisualMist } from "../module/scene-visual-settings.mjs";
import { registerSceneMist, mistAppearance, MIST_FRAGMENT } from "../module/scene-mist.mjs";
import { sceneObjectChildData, sceneObjectPlan, syncSceneObject, sceneObjectAccess } from "../module/scene-objects.mjs";

function model() {
    return { kind: "visualEffect", name: "Brume", active: true,
        mist: { ...MIST_DEFAULTS }, light: { enabled: false, color: "#84952f", negative: false,
            priority: 0, dim: 3, bright: 0, luminosity: 0.5, speed: 2, intensity: 5, animation: "" } };
}
function tile(data = model()) {
    return { id: "mist", x: 300, y: 200, width: 600, height: 600, alpha: 0.8, rotation: 10, elevation: 2,
        hidden: false, levels: new Set(["floor"]),
        parent: { id: "scene", grid: { size: 100, distance: 1 } },
        flags: { "arcane-advent": { sceneObject: data } } };
}
test("new mist settings describe an opaque visual overlay, not emitted light", () => {
    const source = model();
    assert.equal(sceneMist(source).enabled, true);
    assert.equal(sceneLightEnabled(source), false);
    assert.equal(sceneMist({ kind: "sceneryElement" }).enabled, false);
});
test("legacy fog converts without affecting fire models or explicit mist settings", () => {
    const fog = { light: { enabled: true, animation: "fog", color: "#336633", alpha: 0.7, speed: 4 } };
    const migrated = migrateVisualMist(fog);
    assert.equal(migrated.light.enabled, false);
    assert.deepEqual(migrated.mist, { ...MIST_DEFAULTS, enabled: true, color: "#336633", density: 0.7, speed: 2 });
    assert.deepEqual(migrateVisualMist(structuredClone(migrated)), migrated);
    const fire = migrateVisualMist({ light: { enabled: true, animation: "torch" } });
    assert.equal(fire.mist.enabled, false); assert.equal(fire.light.enabled, true);
    assert.equal(migrateVisualMist({ light: { enabled: true, negative: true, animation: "fog" } }).light.enabled, true);
    const off = migrateVisualMist({ light: { enabled: false, animation: "fog" } });
    assert.equal(off.mist.enabled, false);
    assert.deepEqual(migrateVisualMist({ light: { priority: 2 } }), { light: { priority: 2 } });
    const fresh = migrateVisualMist({});
    assert.equal(fresh.mist, undefined);
});
test("already placed legacy fog also becomes mist without retaining a light", () => {
    const legacy = { kind: "visualEffect", light: { enabled: true, animation: "smokepatch", alpha: 0.5 } };
    assert.equal(sceneMist(legacy).enabled, true);
    assert.equal(sceneLightEnabled(legacy), false);
});
test("plain mist creates a region without creating an AmbientLight", () => {
    globalThis.CONST = { REGION_VISIBILITY: { ALWAYS: 1, LAYER_UNLOCKED: 4 } };
    const data = sceneObjectChildData(tile());
    assert.equal(data.light, null);
    assert.equal(data.region.shapes[0].radius, 300);
    assert.equal(data.region.color, MIST_DEFAULTS.color);
});
test("a shadow zone uses Foundry negative sources, radius and configurable priority", () => {
    globalThis.CONFIG = { Canvas: { lightAnimations: {}, darknessAnimations: { denseSmoke: {} } } };
    const source = model();
    Object.assign(source.light, { enabled: true, negative: true, priority: 4, animation: "denseSmoke" });
    const data = sceneObjectChildData(tile(source));
    assert.equal(data.light.config.negative, true);
    assert.equal(data.light.config.priority, 4);
    assert.equal(data.light.config.dim, 3);
    assert.equal(data.light.config.bright, 0);
    assert.equal(data.light.config.animation.type, "denseSmoke");
    source.light.animation = "torch";
    assert.equal(sceneObjectChildData(tile(source)).light.config.animation.type, null);
});
test("converting a placed legacy fog removes its old light while preserving its existing region", async () => {
    const source = model(); delete source.mist;
    Object.assign(source.light, { enabled: true, animation: "fog" });
    const anchor = tile(source);
    const light = { id: "old-light", flags: { "arcane-advent": { sceneObjectParent: "mist" } } };
    const region = { id: "region", flags: { "arcane-advent": { sceneObjectParent: "mist" } } };
    const deleted = [], updated = [];
    Object.assign(anchor.parent, {
        tiles: new Map([[anchor.id, anchor]]), lights: [light], regions: [region],
        async deleteEmbeddedDocuments(type, ids) { deleted.push({ type, ids }); },
        async updateEmbeddedDocuments(type, docs) { updated.push({ type, docs }); }
    });
    await syncSceneObject(anchor);
    assert.deepEqual(deleted, [{ type: "AmbientLight", ids: ["old-light"] }]);
    assert.equal(updated[0].type, "Region");
    assert.equal(updated[0].docs[0]._id, "region");
});
test("mist activation, hidden state, floor and source alpha control rendering on every client", () => {
    const anchor = tile(), settings = mistAppearance(anchor, "floor");
    assert.equal(settings.diameter, 600); assert.equal(settings.opacity, 0.8);
    assert.equal(settings.density, MIST_DEFAULTS.density);
    assert.equal(mistAppearance(anchor, "other"), null);
    anchor.hidden = true; assert.equal(mistAppearance(anchor, "floor"), null);
    anchor.hidden = false; anchor.flags["arcane-advent"].sceneObject.active = false;
    assert.equal(mistAppearance(anchor, "floor"), null);
});
test("GM can toggle a mist that has no light while players cannot activate generic effects", () => {
    const anchor = tile();
    assert.equal(sceneObjectAccess(anchor, { isGM: true }).toggleLight, true);
    assert.equal(sceneObjectAccess(anchor, { isGM: false, viewedScene: "scene", viewedLevel: "floor" }).toggleLight, false);
});
test("renderer creates an unbatched normal-alpha mesh and disposes it across updates and scene changes", () => {
    const hooks = new Map(), meshes = [], anchor = tile();
    globalThis.Hooks = { on(name, handler) { hooks.set(name, handler); } };
    class Shader {
        static get defaultUniforms() { return { native: true }; }
        constructor() { this.uniforms = { ...this.constructor.defaultUniforms }; }
        _preRender() {}
    }
    class Mesh {
        constructor({ shaderClass }) {
            this.shader = new shaderClass(); meshes.push(this);
            this.anchor = { set() {} }; this.position = { set(x, y) { this.x = x; this.y = y; } };
        }
        destroy() { this.destroyed = true; }
    }
    globalThis.PIXI = { Texture: { WHITE: {} }, BLEND_MODES: { NORMAL: 0 } };
    globalThis.foundry = { canvas: {
        rendering: { shaders: { PrimaryBaseSamplerShader: Shader } },
        primary: { PrimarySpriteMesh: Mesh }, groups: { PrimaryCanvasGroup: { SORT_LAYERS: { WEATHER: 1000 } } }
    } };
    globalThis.canvas = {
        ready: true, scene: { id: "scene", tiles: [anchor] }, level: { id: "floor" },
        primary: { addChild() {} }, app: { ticker: { lastTime: 1000 } }
    };
    registerSceneMist();
    hooks.get("canvasReady")();
    assert.equal(meshes.length, 1);
    assert.equal(meshes[0].blendMode, PIXI.BLEND_MODES.NORMAL);
    assert.equal(meshes[0].shader.constructor.classPluginName, null);
    assert.equal(meshes[0].shader.constructor.pausable, false);
    assert.equal(meshes[0]._shouldRenderDepth(), false);
    assert.equal(meshes[0].elevation, 2);
    assert.equal(meshes[0].width, 600);
    assert.equal(meshes[0].eventMode, "none");
    meshes[0].shader._preRender(meshes[0]);
    assert.equal(meshes[0].shader.uniforms.aaTime, 1);
    anchor.x = 500;
    hooks.get("updateTile")(anchor);
    assert.equal(meshes.length, 1); assert.equal(meshes[0].position.x, 500);
    anchor.flags["arcane-advent"].sceneObject.mist.speed = 0;
    hooks.get("updateTile")(anchor);
    meshes[0].shader._preRender(meshes[0]);
    assert.equal(meshes[0].shader.uniforms.aaTime, 0);
    anchor.hidden = true;
    hooks.get("updateTile")(anchor);
    assert.equal(meshes[0].destroyed, true);
    anchor.hidden = false;
    hooks.get("updateTile")(anchor);
    assert.equal(meshes.length, 2);
    hooks.get("canvasTearDown")();
    assert.equal(meshes[1].destroyed, true);
    hooks.get("canvasReady")();
    assert.equal(meshes.length, 3);
    hooks.get("deleteTile")(anchor);
    assert.equal(meshes[2].destroyed, true);
});
test("shader uses normal covering opacity with a soft circular boundary", () => {
    assert.match(MIST_FRAGMENT, /smoothstep\(1\.0 - aaSoftness, 1\.0, length\(uv\)\)/);
    assert.match(MIST_FRAGMENT, /vec4\(color \* opacity, opacity\)/);
});

test("placing an older fog blueprint snapshots mist and removes emission without changing the blueprint", () => {
    const data = model(); delete data.mist;
    Object.assign(data.light, { enabled: true, animation: "fog", alpha: 0.6 });
    const item = { type: "visualEffect", name: "Old fog", img: "icon.svg", uuid: "Item.fog",
        system: { light: data.light, placement: { radius: 3, opacity: 1, elevation: 0, rotation: 0 }, interaction: {} } };
    const scene = { grid: { size: 100, distance: 1 }, width: 1000, height: 1000 };
    const placed = sceneObjectPlan(item, scene, { x: 500, y: 500 }).flags["arcane-advent"].sceneObject;
    assert.equal(placed.mist.enabled, true);
    assert.equal(placed.light.enabled, false);
    assert.equal(placed.mist.density, 0.6);
    assert.equal(item.system.light.enabled, true);
});

test("mist appearance follows the same synchronized trajectory as a video projectile", () => {
    const anchor = tile();
    anchor.x = 700; anchor.y = 500;
    anchor.flags["arcane-advent"].sceneObject.flight = {
        id: "flight", from: { x: 100, y: 100 }, to: { x: 700, y: 500 }, startedAt: 1000, duration: 800
    };
    globalThis.game = { time: { serverTime: 1400 } };
    const appearance = mistAppearance(anchor, "floor");
    assert.deepEqual([appearance.x, appearance.y], [400, 300]);
});
