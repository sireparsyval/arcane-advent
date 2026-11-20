import test from "node:test";
import assert from "node:assert/strict";
import { animationMedia, registerSceneAnimations } from "../module/scene-animation-service.mjs";
class Collection extends Map { [Symbol.iterator]() { return this.values(); } }

test("video metadata uses the actual clip duration and rejects GIF or failed assets before placement", async () => {
    let calls = 0;
    globalThis.foundry = { canvas: { async loadTexture(src) { calls++; return src === "broken.webm" ? null : { src }; } } };
    globalThis.game = { video: { getVideoSource: texture => texture.src.endsWith(".webm") ? { duration: 1.5 } : null } };
    assert.deepEqual(await animationMedia({ texture: { src: "explosion.webm" } }), { duration: 1500 });
    assert.deepEqual(await animationMedia({ texture: { src: "image.png" } }), { duration: null });
    await assert.rejects(animationMedia({ texture: { src: "old.gif" } }), /WebM/);
    await assert.rejects(animationMedia({ texture: { src: "broken.webm" } }), /chargé/);
    assert.equal(calls, 3);
});

for (const mode of ["once-delete", "once-keep", "loop"]) {
    test("native video playback starts correctly and honors " + mode, async () => {
        const hooks = new Map(), plays = [], removed = [];
        globalThis.Hooks = { on(name, fn) { hooks.set(name, fn); }, once() {} };
        globalThis.CONFIG = { queries: {} };
        globalThis.ui = { notifications: { error(message) { throw Error(message); } } };
        class Video extends EventTarget {
            duration = 1; currentTime = 0; ended = false; loop = true; paused = true;
            pause() { this.paused = true; }
        }
        const video = new Video(), scene = { id: "scene", tiles: new Collection() };
        const play = { id: "play", mode, duration: 1000, startedAt: 1000, state: "playing" };
        const tile = { id: "tile", parent: scene, object: { texture: {} },
            flags: { "arcane-advent": { sceneObject: { kind: "visualEffect", playback: play } } },
            async update(changes) {
                for (const [key, value] of Object.entries(changes)) {
                    const parts = key.split("."); let target = this;
                    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
                    target[parts.at(-1)] = value;
                }
                hooks.get("updateTile")(this);
            } };
        scene.tiles.set(tile.id, tile);
        globalThis.game = {
            user: { isGM: true }, users: { activeGM: { isSelf: true } }, time: { serverTime: 1500 },
            scenes: new Collection([["scene", scene]]),
            video: { getVideoSource: () => video, async play(_video, options) {
                plays.push(options); video.currentTime = options.offset; video.loop = options.loop; video.paused = false;
            } }
        };
        registerSceneAnimations({ planFor() {}, create() {}, sync() {},
            async remove(doc) { removed.push(doc.id); scene.tiles.delete(doc.id); hooks.get("deleteTile")(doc); } });
        hooks.get("drawTile")({ document: tile });
        assert.equal(plays.length, 1);
        assert.equal(plays[0].offset, 0.5);
        assert.equal(video.loop, mode === "loop");
        hooks.get("updateTile")(tile);
        assert.equal(plays.length, 1, "metadata updates must not restart the clip");
        video.ended = true; video.currentTime = 1;
        video.dispatchEvent(new Event("ended"));
        await new Promise(resolve => setImmediate(resolve));
        if (mode === "once-delete") {
            assert.deepEqual(removed, ["tile"]);
            assert.equal(scene.tiles.size, 0);
        } else if (mode === "once-keep") {
            assert.equal(scene.tiles.size, 1);
            assert.equal(play.state, "ended");
            assert.equal(tile.video.autoplay, false);
            assert.equal(video.paused, true);
            assert.ok(video.currentTime > 0.99);
        } else {
            assert.equal(scene.tiles.size, 1);
            assert.equal(play.state, "playing");
        }
        hooks.get("canvasTearDown")();
    });
}
