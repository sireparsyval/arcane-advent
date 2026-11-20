import { sceneClock, projectileFrame } from "./scene-projectiles.mjs";
import { validateAnimationAppearance } from "./scene-animation-settings.mjs";

export const ANIMATION_QUERY = "arcane-advent.animations";
const scope = "arcane-advent";
const modelFor = tile => tile?.getFlag?.(scope, "sceneObject") ?? tile?.flags?.[scope]?.sceneObject;
const copy = value => JSON.parse(JSON.stringify(value));

export function validateAnimationRoute(scene, input, duration) {
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0.1 || duration > 60) {
        throw Error("La durée du trajet doit être comprise entre 0,1 et 60 secondes.");
    }
    if (!Array.isArray(input) || input.length < 2 || input.length > 64) throw Error("Choisissez entre 2 et 64 points.");
    const width = scene.dimensions?.width ?? scene.width, height = scene.dimensions?.height ?? scene.height;
    const points = [];
    for (const point of input) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
            || point.x < 0 || point.y < 0 || point.x > width || point.y > height) throw Error("Le trajet doit rester dans la scène.");
        const next = { x: Math.round(point.x), y: Math.round(point.y) }, last = points.at(-1);
        if (!last || last.x !== next.x || last.y !== next.y) points.push(next);
    }
    if (points.length < 2) throw Error("Choisissez deux points différents.");
    return { points, duration: Math.round(duration * 1000) };
}

export async function animationMedia(source) {
    const src = source.texture?.src;
    if (!src) return { duration: null };
    if (/\.gif(?:[?#]|$)/i.test(src)) throw Error("Utilisez un fichier WebM pour une animation sur la scène.");
    const texture = await foundry.canvas.loadTexture(src);
    if (!texture) throw Error("Le visuel de l’animation n’a pas pu être chargé.");
    const video = game.video.getVideoSource(texture);
    if (!video) return { duration: null };
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw Error("La durée de la vidéo n’est pas disponible.");
    return { duration: Math.round(video.duration * 1000) };
}

export function createAnimationService({ planFor, create, remove, resolve = uuid => fromUuid(uuid),
    media = animationMedia, clock = sceneClock, randomID = () => foundry.utils.randomID() }) {
    let operations = Promise.resolve();
    const enqueue = task => {
        const result = operations.catch(() => {}).then(task);
        operations = result.catch(() => {});
        return result;
    };
    const alive = tile => tile.parent.tiles.has(tile.id);
    async function blueprint(uuid, scene, point) {
        if (typeof uuid !== "string" || !uuid) throw Error("Choisissez un modèle d’effet.");
        const item = await resolve(uuid);
        if (!item || item.type !== "visualEffect") throw Error("Ce modèle d’effet visuel n’est plus disponible.");
        const source = planFor(item, scene, point);
        const metadata = await media(source);
        return { source, metadata };
    }
    function arrivalMode(value) {
        if (!["keep", "delete", "replace"].includes(value)) throw Error("Choisissez le comportement à l’arrivée.");
        return value;
    }
    async function finalPlan(data, scene, point) {
        const mode = data.finalMode ?? "once-delete";
        if (!["once-delete", "once-keep", "loop"].includes(mode)) throw Error("Choisissez la lecture de l’effet final.");
        const duration = data.finalDuration ?? 1;
        if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0.1 || duration > 60) {
            throw Error("La durée d’un effet sans vidéo doit être comprise entre 0,1 et 60 secondes.");
        }
        const plan = await blueprint(data.finalEffectUuid, scene, point);
        return { source: plan.source, duration: plan.metadata.duration ?? Math.round(duration * 1000), mode };
    }
    function playback(source, mode, duration, startedAt = clock()) {
        const model = source.flags[scope].sceneObject;
        model.flight = null; model.active = true;
        model.playback = { id: randomID(), mode, duration, startedAt, state: "playing" };
        source.hidden = false;
        source.flags.core = { ...source.flags.core, randomizeVideo: false };
        source.video = { ...source.video, loop: mode === "loop", autoplay: true, volume: 0 };
        return source;
    }
    function stationary(tile) {
        if (!tile || modelFor(tile)?.kind !== "visualEffect") throw Error("Cet effet n’est plus sur la scène.");
        const flight = modelFor(tile).flight;
        if (flight) throw Error("Attendez l’arrivée de cet effet avant de préparer la suite.");
    }
    async function replace(tile, plan) {
        const source = playback(copy(plan.source), plan.mode, plan.duration);
        source.x = tile.x; source.y = tile.y; source.levels = [...(tile.levels ?? [])];
        const replacement = await create(tile.parent, source);
        try { await remove(tile); }
        catch (error) { await remove(replacement); throw error; }
        return replacement;
    }
    async function execute(data, user) {
        if (!game.user.isGM || !user?.isGM) throw Error("Seul le MJ peut lancer les animations.");
        const scene = game.scenes.get(data?.sceneId);
        if (!scene) throw Error("La scène n’est plus disponible.");
        if (data.levelId && !scene.levels?.has(data.levelId)) throw Error("L’étage n’est plus disponible.");
        const tile = data.tileId ? scene.tiles.get(data.tileId) : null;
        if (data.action === "remove") { stationary(tile); await remove(tile); return { ok: true }; }
        if (data.action === "transition") {
            stationary(tile);
            const plan = await finalPlan(data, scene, { x: tile.x, y: tile.y });
            const replacement = await replace(tile, plan);
            return { ok: true, tileId: replacement.id };
        }
        if (!["launch", "continue"].includes(data.action)) throw Error("Cette action d’animation n’est pas autorisée.");
        const route = validateAnimationRoute(scene, data.points, data.duration);
        const appearance = validateAnimationAppearance(data);
        const end = route.points.at(-1), arrival = { mode: arrivalMode(data.arrival ?? "keep") };
        if (data.action === "continue") {
            stationary(tile);
            if (route.points[0].x !== tile.x || route.points[0].y !== tile.y) {
                throw Error("L’effet a été déplacé : préparez à nouveau son trajet.");
            }
        }
        if (arrival.mode === "replace") arrival.final = await finalPlan(data, scene, end);
        let initial;
        if (data.action === "launch") initial = await blueprint(data.effectUuid, scene, end);
        const startedAt = clock() + 200;
        const flight = { id: randomID(), points: route.points, from: route.points[0], to: end,
            startedAt, duration: route.duration, arrival };
        const geometry = data.action === "launch" ? initial.source : tile;
        const visual = flight.visual = {
            width: geometry.width * appearance.initialSize / 100,
            height: geometry.height * appearance.initialSize / 100,
            rotation: geometry.rotation ?? 0, endScale: appearance.finalSize / 100, spin: appearance.spin
        };
        const dimensions = { width: visual.width * visual.endScale, height: visual.height * visual.endScale,
            rotation: ((visual.rotation + visual.spin * data.duration) % 360 + 360) % 360 };
        const settings = { arrival: arrival.mode, finalEffectUuid: data.finalEffectUuid ?? "",
            finalMode: data.finalMode ?? "once-delete", finalDuration: data.finalDuration ?? 1, ...appearance };
        if (data.action === "launch") {
            const source = playback(initial.source, "loop", initial.metadata.duration ?? 0, startedAt);
            Object.assign(source, dimensions);
            source.flags[scope].sceneObject.animation = settings;
            source.flags[scope].sceneObject.projectileDuration = data.duration;
            source.flags[scope].sceneObject.flight = flight;
            if (data.levelId && scene.levels?.has(data.levelId)) source.levels = [data.levelId];
            else if (canvas.scene?.id === scene.id && canvas.level?.id) source.levels = [canvas.level.id];
            const created = await create(scene, source);
            return { ok: true, tileId: created.id };
        }
        await tile.update({ ...end, ...dimensions, hidden: false, "flags.arcane-advent.sceneObject.active": true,
            "flags.arcane-advent.sceneObject.animation": settings,
            "flags.arcane-advent.sceneObject.projectileDuration": data.duration,
            "flags.arcane-advent.sceneObject.flight": flight }, { sceneObjectSync: true });
        // Persist child positions at B; clients interpolate their rendering along the route.
        await adapters.sync(tile);
        return { ok: true, tileId: tile.id };
    }
    const adapters = { sync: async () => {} };
    async function complete(tile, id) {
        if (!game.user.isGM || !alive(tile)) return;
        const flight = modelFor(tile)?.flight;
        if (!flight || flight.id !== id) return;
        const frame = projectileFrame(flight, clock());
        if (frame && !frame.done) return;
        const mode = flight.arrival?.mode ?? "keep";
        try {
            if (mode === "delete") await remove(tile);
            else if (mode === "replace") await replace(tile, flight.arrival.final);
            else await tile.update({ "flags.arcane-advent.sceneObject.flight": null }, { sceneObjectSync: true });
        } catch (error) {
            if (alive(tile)) await tile.update({
                "flags.arcane-advent.sceneObject.flight": null,
                "flags.arcane-advent.sceneObject.animationError": error.message
            }, { sceneObjectSync: true });
            throw error;
        }
    }
    async function finishPlayback(tile, id) {
        if (!game.user.isGM || !alive(tile)) return;
        const play = modelFor(tile)?.playback;
        if (!play || play.id !== id || play.mode === "loop" || play.state !== "playing") return;
        if (play.mode === "once-delete") await remove(tile);
        else await tile.update({
            "flags.arcane-advent.sceneObject.playback.state": "ended",
            "video.autoplay": false
        }, { sceneObjectSync: true, playVideo: false });
    }
    return {
        setSync(sync) { adapters.sync = sync; },
        execute: (data, user) => enqueue(() => execute(data, user)),
        complete: (tile, id) => enqueue(() => complete(tile, id)),
        finishPlayback: (tile, id) => enqueue(() => finishPlayback(tile, id)),
        async sweep() {
            for (const scene of game.scenes) for (const tile of [...scene.tiles]) {
                const model = modelFor(tile);
                const flight = model?.flight;
                if (flight) {
                    const frame = projectileFrame(flight, clock());
                    if (!frame || frame.done) await enqueue(() => complete(tile, flight.id));
                }
                const play = model?.playback;
                if (play?.state === "playing" && play.mode !== "loop"
                    && (clock() >= play.startedAt + play.duration || clock() < play.startedAt - 1000)) {
                    const video = tile.object?.texture && game.video?.getVideoSource(tile.object.texture);
                    // A visible video finishes on its real ended event, even if buffering delayed playback.
                    if (video && !video.ended && video.currentTime < video.duration - 0.05
                        && clock() < play.startedAt + play.duration + 15000) continue;
                    await enqueue(() => finishPlayback(tile, play.id));
                }
            }
        }
    };
}

export async function requestSceneAnimation(data) {
    if (!game.user.isGM) throw Error("Seul le MJ peut lancer les animations.");
    const gm = game.users.activeGM;
    if (!gm) throw Error("Un MJ doit être connecté.");
    const result = gm.isSelf ? await CONFIG.queries[ANIMATION_QUERY](data, { user: game.user })
        : await gm.query(ANIMATION_QUERY, data, { timeout: 30000 });
    if (!result?.ok) throw Error(result?.error ?? "L’animation n’a pas pu être lancée.");
    return result;
}

export function registerSceneAnimations({ planFor, create, remove, sync }) {
    const service = createAnimationService({ planFor, create, remove });
    service.setSync(sync);
    CONFIG.queries[ANIMATION_QUERY] = (data, { user }) => service.execute(data, user)
        .catch(error => ({ error: error.message }));
    const notifyError = error => ui.notifications.error(error.message);
    const complete = (tile, id) => {
        if (game.users.activeGM?.isSelf) service.complete(tile, id).catch(notifyError);
    };
    let sweeping = false;
    Hooks.once("ready", () => {
        const timer = setInterval(async () => {
            if (sweeping || !game.users.activeGM?.isSelf) return;
            sweeping = true;
            try { await service.sweep(); } catch (error) { notifyError(error); }
            finally { sweeping = false; }
        }, 250);
        window.addEventListener("beforeunload", () => clearInterval(timer), { once: true });
    });
    const videoBindings = new Map();
    function bindVideo(tile) {
        const play = modelFor(tile)?.playback, video = game.video.getVideoSource(tile.object?.texture);
        if (!play || !video) return;
        const key = tile.parent.id + "." + tile.id;
        const previous = videoBindings.get(key);
        if (previous?.video === video && previous.id === play.id) {
            if (play.state === "ended") {
                video.pause(); video.currentTime = Math.max(0, video.duration - 0.001);
            }
            return;
        }
        previous?.cleanup();
        video.loop = play.mode === "loop";
        const elapsed = Math.max(0, clockElapsed(play));
        const offset = play.mode === "loop" && video.duration ? elapsed % video.duration : Math.min(elapsed, video.duration);
        if (play.state === "ended" || (play.mode !== "loop" && elapsed >= video.duration)) {
            video.pause(); video.currentTime = Math.max(0, video.duration - 0.001);
            if (play.state !== "ended" && game.users.activeGM?.isSelf) {
                service.finishPlayback(tile, play.id).catch(notifyError);
            }
        } else game.video.play(video, { playing: true, loop: video.loop, offset, volume: 0 });
        const ended = () => {
            if (game.users.activeGM?.isSelf) service.finishPlayback(tile, play.id).catch(notifyError);
        };
        video.addEventListener("ended", ended);
        videoBindings.set(key, { video, id: play.id, cleanup: () => video.removeEventListener("ended", ended) });
    }
    const clockElapsed = play => (sceneClock() - play.startedAt) / 1000;
    Hooks.on("drawTile", object => bindVideo(object.document));
    Hooks.on("updateTile", bindVideo);
    Hooks.on("deleteTile", tile => {
        const key = tile.parent.id + "." + tile.id;
        videoBindings.get(key)?.cleanup(); videoBindings.delete(key);
    });
    Hooks.on("canvasTearDown", () => { for (const binding of videoBindings.values()) binding.cleanup(); videoBindings.clear(); });
    return { complete };
}
