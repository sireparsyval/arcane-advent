import test from "node:test";
import assert from "node:assert/strict";
import { createAnimationService, validateAnimationRoute } from "../module/scene-animation-service.mjs";
import { projectileFrame } from "../module/scene-projectiles.mjs";

class Collection extends Map { [Symbol.iterator]() { return this.values(); } }
function setup() {
    let time = 1000, serial = 0, failCreate = false, failRemove = false;
    const events = [], models = new Map([
        ["Item.ball", { uuid: "Item.ball", name: "Boule de feu", type: "visualEffect" }],
        ["Item.blast", { uuid: "Item.blast", name: "Explosion", type: "visualEffect" }]
    ]);
    const scene = { id: "scene", width: 2000, height: 1500, grid: { size: 100, distance: 1 }, tiles: new Collection() };
    globalThis.game = { user: { isGM: true }, scenes: new Collection([[scene.id, scene]]) };
    globalThis.canvas = { scene, level: { id: "floor" } };
    const planFor = (item, _scene, point) => ({
        name: item.name, ...point, width: 100, height: 100, texture: { src: item.name + ".webm" },
        flags: { "arcane-advent": { sceneObject: { kind: "visualEffect", name: item.name, sourceUuid: item.uuid, active: true } } }
    });
    const remove = async tile => {
        if (failRemove && tile.id === "tile1") throw Error("remove failed");
        scene.tiles.delete(tile.id); events.push({ action: "remove", id: tile.id });
    };
    const service = createAnimationService({
        planFor, resolve: async uuid => models.get(uuid),
        media: async source => ({ duration: source.name === "Explosion" ? 500 : 2000 }),
        clock: () => time, randomID: () => "id" + ++serial,
        create: async (_scene, source) => {
            if (failCreate) throw Error("create failed");
            const tile = { ...structuredClone(source), id: "tile" + (events.filter(e => e.action === "create").length + 1), parent: scene };
            tile.levels = new Set(source.levels ?? []);
            tile.update = async changes => {
                events.push({ action: "update", id: tile.id, changes: structuredClone(changes) });
                for (const [key, value] of Object.entries(changes)) {
                    const parts = key.split("."); let target = tile;
                    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
                    target[parts.at(-1)] = value;
                }
            };
            scene.tiles.set(tile.id, tile); events.push({ action: "create", id: tile.id });
            return tile;
        }, remove
    });
    const model = tile => tile.flags["arcane-advent"].sceneObject;
    const launch = extra => service.execute({ action: "launch", sceneId: "scene", effectUuid: "Item.ball",
        points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 400 }],
        duration: 1, arrival: "keep", ...extra }, game.user);
    const arrive = async tile => { const flight = model(tile).flight; time = flight.startedAt + flight.duration; await service.complete(tile, flight.id); };
    return { scene, models, service, events, model, launch, arrive,
        setTime: value => { time = value; }, failCreate: () => { failCreate = true; }, failRemove: () => { failRemove = true; } };
}

test("route validation bounds points and duration and removes duplicate consecutive steps", () => {
    const { scene } = setup();
    const route = validateAnimationRoute(scene, [{ x: 10.2, y: 20.2 }, { x: 10, y: 20 }, { x: 100, y: 200 }], 60);
    assert.deepEqual(route, { points: [{ x: 10, y: 20 }, { x: 100, y: 200 }], duration: 60000 });
    for (const duration of [0, 61, NaN, "1"]) assert.throws(() => validateAnimationRoute(scene, [{x:1,y:1},{x:2,y:2}], duration), /durée/);
    assert.throws(() => validateAnimationRoute(scene, [{ x: -1, y: 0 }, { x: 0, y: 0 }], 1), /scène/);
    assert.throws(() => validateAnimationRoute(scene, [{ x: 1, y: 1 }, { x: 1, y: 1 }], 1), /différents/);
});

test("waypoints are followed at constant speed over the entire route", () => {
    const flight = { id: "route", points: [{x:0,y:0},{x:100,y:0},{x:100,y:300}],
        startedAt: 1000, duration: 1000 };
    assert.deepEqual(projectileFrame(flight, 1250), { x: 100, y: 0, progress: 0.25, done: false });
    assert.deepEqual(projectileFrame(flight, 1500), { x: 100, y: 100, progress: 0.5, done: false });
    assert.deepEqual(projectileFrame(flight, 2000), { x: 100, y: 300, progress: 1, done: true });
});

test("a model can be launched directly and survives as a reusable blueprint", async () => {
    const env = setup();
    assert.equal(env.scene.tiles.size, 0);
    const result = await env.launch();
    assert.equal(env.scene.tiles.size, 1);
    const tile = env.scene.tiles.get(result.tileId), flight = env.model(tile).flight;
    assert.equal(flight.points.length, 3);
    assert.deepEqual([tile.x, tile.y], [200, 400]);
    assert.equal(tile.video.loop, true); assert.equal(tile.flags.core.randomizeVideo, false);
    assert.equal(env.models.get("Item.ball").name, "Boule de feu");
    await env.arrive(tile);
    assert.equal(env.scene.tiles.size, 1); assert.equal(env.model(tile).flight, null);
});

test("a held projectile can continue from its actual arrival without creating a second copy", async () => {
    const env = setup(), { tileId } = await env.launch();
    const tile = env.scene.tiles.get(tileId);
    await env.arrive(tile);
    await env.service.execute({ action: "continue", sceneId: "scene", tileId,
        points: [{ x: 200, y: 400 }, { x: 400, y: 500 }], duration: 0.5, arrival: "keep" }, game.user);
    assert.equal(env.scene.tiles.size, 1);
    assert.deepEqual(env.model(tile).flight.from, { x: 200, y: 400 });
    await env.arrive(tile);
    await assert.rejects(env.service.execute({ action: "continue", sceneId: "scene", tileId,
        points: [{ x: 0, y: 0 }, { x: 600, y: 600 }], duration: 0.5, arrival: "keep" }, game.user), /déplacé/);
});

test("delete on arrival removes the projectile and never deletes its model", async () => {
    const env = setup(), { tileId } = await env.launch({ arrival: "delete" });
    const tile = env.scene.tiles.get(tileId);
    await env.arrive(tile);
    assert.equal(env.scene.tiles.size, 0);
    assert.equal(env.models.size, 2);
});

test("automatic arrival uses a snapshot of the selected final effect and its real video duration", async () => {
    const env = setup(), { tileId } = await env.launch({ arrival: "replace", finalEffectUuid: "Item.blast",
        finalMode: "once-delete", finalDuration: 20 });
    const tile = env.scene.tiles.get(tileId);
    env.models.get("Item.blast").name = "Renamed model";
    await env.arrive(tile);
    assert.equal(env.scene.tiles.size, 1);
    const final = [...env.scene.tiles][0];
    assert.notEqual(final.id, tileId); assert.equal(final.name, "Explosion");
    assert.deepEqual([final.x, final.y], [200, 400]);
    assert.equal(final.video.loop, false); assert.equal(final.video.autoplay, true);
    assert.equal(env.model(final).playback.duration, 500);
    assert.equal(env.model(final).playback.mode, "once-delete");
    await env.service.finishPlayback(final, env.model(final).playback.id);
    assert.equal(env.scene.tiles.size, 0);
});

test("a manual impact can replace a held projectile and retain the last frame after one play", async () => {
    const env = setup(), { tileId } = await env.launch();
    const ball = env.scene.tiles.get(tileId); await env.arrive(ball);
    const { tileId: finalId } = await env.service.execute({ action: "transition", sceneId: "scene", tileId,
        finalEffectUuid: "Item.blast", finalMode: "once-keep", finalDuration: 1 }, game.user);
    const final = env.scene.tiles.get(finalId), play = env.model(final).playback;
    await env.service.finishPlayback(final, "wrong-id");
    assert.equal(env.model(final).playback.state, "playing");
    await env.service.finishPlayback(final, play.id);
    assert.equal(env.scene.tiles.size, 1);
    assert.equal(env.model(final).playback.state, "ended");
    assert.equal(final.video.autoplay, false);
});

test("looping final effects remain and can be removed explicitly", async () => {
    const env = setup(), { tileId } = await env.launch({ arrival: "replace", finalEffectUuid: "Item.blast", finalMode: "loop" });
    await env.arrive(env.scene.tiles.get(tileId));
    const final = [...env.scene.tiles][0];
    env.setTime(100000);
    await env.service.sweep();
    assert.equal(env.scene.tiles.size, 1);
    await env.service.finishPlayback(final, env.model(final).playback.id);
    assert.equal(env.scene.tiles.size, 1);
    await env.service.execute({ action: "remove", sceneId: "scene", tileId: final.id }, game.user);
    assert.equal(env.scene.tiles.size, 0);
});

test("the lifecycle completes arrivals and deletes finished clips without the scene being viewed", async () => {
    const env = setup(), { tileId } = await env.launch({ arrival: "replace", finalEffectUuid: "Item.blast", finalMode: "once-delete" });
    const ball = env.scene.tiles.get(tileId), flight = env.model(ball).flight;
    env.setTime(flight.startedAt + flight.duration);
    canvas.scene = { id: "elsewhere" };
    await env.service.sweep();
    const final = [...env.scene.tiles][0], play = env.model(final).playback;
    env.setTime(play.startedAt + play.duration);
    await env.service.sweep();
    assert.equal(env.scene.tiles.size, 0);
});

test("invalid options and permissions are rejected before anything is placed", async () => {
    const env = setup();
    await assert.rejects(env.launch({ arrival: "replace", finalEffectUuid: "" }), /modèle/);
    await assert.rejects(env.launch({ arrival: "replace", finalEffectUuid: "Item.blast", finalMode: "arbitrary" }), /lecture/);
    await assert.rejects(env.service.execute({ action: "launch", sceneId: "scene" }, { isGM: false }), /MJ/);
    await assert.rejects(env.launch({ effectUuid: "Item.deleted" }), /disponible/);
    assert.equal(env.scene.tiles.size, 0); assert.equal(env.events.length, 0);
});

test("a failed final creation retains the projectile and allows a later manual retry", async () => {
    const env = setup(), { tileId } = await env.launch({ arrival: "replace", finalEffectUuid: "Item.blast", finalMode: "once-delete" });
    const tile = env.scene.tiles.get(tileId);
    env.failCreate();
    await assert.rejects(env.arrive(tile), /create failed/);
    assert.equal(env.scene.tiles.size, 1);
    assert.equal(env.model(tile).flight, null);
    assert.equal(env.model(tile).animationError, "create failed");
});

test("if the old effect cannot be removed, the replacement is rolled back", async () => {
    const env = setup(), { tileId } = await env.launch();
    const tile = env.scene.tiles.get(tileId); await env.arrive(tile);
    env.failRemove();
    await assert.rejects(env.service.execute({ action: "transition", sceneId: "scene", tileId,
        finalEffectUuid: "Item.blast", finalMode: "once-delete" }, game.user), /remove failed/);
    assert.equal(env.scene.tiles.size, 1); assert.equal(env.scene.tiles.has(tileId), true);
});

test("duplicate completion notifications create only one final effect", async () => {
    const env = setup(), { tileId } = await env.launch({ arrival: "replace", finalEffectUuid: "Item.blast", finalMode: "once-delete" });
    const tile = env.scene.tiles.get(tileId), flight = env.model(tile).flight;
    env.setTime(flight.startedAt + flight.duration);
    await Promise.all([env.service.complete(tile, flight.id), env.service.complete(tile, flight.id)]);
    assert.equal(env.scene.tiles.size, 1);
    assert.equal(env.events.filter(event => event.action === "create").length, 2);
});

test("timer and renderer completion notifications can race without duplicating or throwing", async () => {
    const env = setup(), { tileId } = await env.launch({ arrival: "keep" });
    const tile = env.scene.tiles.get(tileId), flight = env.model(tile).flight;
    env.setTime(flight.startedAt + flight.duration);
    await Promise.all([env.service.complete(tile, flight.id), env.service.sweep()]);
    assert.equal(env.model(tile).flight, null);
    assert.equal(env.scene.tiles.size, 1);
});

test("a visible clip waits for real playback if buffering delayed its end", async () => {
    const env = setup(), { tileId } = await env.launch({ arrival: "replace", finalEffectUuid: "Item.blast", finalMode: "once-delete" });
    await env.arrive(env.scene.tiles.get(tileId));
    const final = [...env.scene.tiles][0], play = env.model(final).playback;
    final.object = { texture: {} };
    const video = { currentTime: 0.1, duration: 0.5, ended: false };
    game.video = { getVideoSource: () => video };
    env.setTime(play.startedAt + play.duration + 50);
    await env.service.sweep();
    assert.equal(env.scene.tiles.size, 1);
    video.ended = true; video.currentTime = 0.5;
    await env.service.sweep();
    assert.equal(env.scene.tiles.size, 0);
});
