const SCOPE = "arcane-advent";
const modelFor = tile => tile?.getFlag?.(SCOPE, "sceneObject") ?? tile?.flags?.[SCOPE]?.sceneObject;
export const sceneClock = () => globalThis.game?.time?.serverTime ?? Date.now();

export function projectileFrame(flight, now = sceneClock()) {
    const points = flight?.points ?? (flight ? [flight.from, flight.to] : []);
    if (!flight?.id || points.length < 2 || points.length > 64
        || points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
        || !Number.isFinite(flight.startedAt) || !Number.isFinite(flight.duration)
        || flight.duration < 100 || flight.duration > 60000 || !Number.isFinite(now)) return null;
    if (now < flight.startedAt - 1000) return null;
    const progress = Math.max(0, Math.min(1, (now - flight.startedAt) / flight.duration));
    const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!total) return null;
    let distance = progress * total;
    for (let i = 0; i < lengths.length; i++) {
        if (!lengths[i]) continue;
        if (distance <= lengths[i] || i === lengths.length - 1) {
            const t = lengths.length === 1 ? progress : Math.min(1, distance / lengths[i]);
            return { x: points[i].x + (points[i + 1].x - points[i].x) * t,
                y: points[i].y + (points[i + 1].y - points[i].y) * t,
                progress, done: progress >= 1 };
        }
        distance -= lengths[i];
    }
    return { ...points.at(-1), progress, done: true };
}

export function sceneObjectFlight(tile) {
    const model = modelFor(tile), motion = tile?.getFlag?.(SCOPE, "objectMotion") ?? tile?.flags?.[SCOPE]?.objectMotion;
    const flight = motion ?? model?.flight;
    // A regular move invalidates a previous trajectory even when imported flags remain.
    return (motion || model?.kind === "visualEffect") && flight?.to?.x === tile.x && flight?.to?.y === tile.y ? flight : null;
}

export function sceneObjectPosition(tile, now = sceneClock()) {
    const frame = projectileFrame(sceneObjectFlight(tile), now);
    return frame ? { x: frame.x, y: frame.y } : { x: tile.x, y: tile.y };
}

export function projectileAppearance(flight, now = sceneClock()) {
    const frame = projectileFrame(flight, now), visual = flight?.visual;
    if (!frame || !visual) return null;
    const scale = 1 + (visual.endScale - 1) * frame.progress;
    return { width: visual.width * scale, height: visual.height * scale,
        rotation: visual.rotationMode === "direction" ? movementHeading(flight.points, frame.progress) + (visual.offset ?? 0)
            : visual.rotation + visual.spin * frame.progress * flight.duration / 1000 };
}

export function movementHeading(points, progress) {
    const lengths = points.slice(1).map((p,i) => Math.hypot(p.x-points[i].x,p.y-points[i].y));
    let distance = progress * lengths.reduce((a,b) => a+b,0);
    for (let i=0;i<lengths.length;i++) {
        if (distance <= lengths[i] || i === lengths.length-1) return Math.atan2(points[i+1].y-points[i].y,points[i+1].x-points[i].x)*180/Math.PI-90;
        distance -= lengths[i];
    }
    return 0;
}

export function registerSceneProjectiles({ onComplete } = {}) {
    const running = new Map();
    const related = (document, tile) => document.getFlag?.(SCOPE, "sceneObjectParent") === tile.id
        || document.flags?.[SCOPE]?.sceneObjectParent === tile.id;
    function paint(tile, point, appearance = null) {
        const object = tile.object;
        const display = object?.mesh ?? object?.bg;
        if (display && !display.destroyed) display.position.set(point.x, point.y);
        if (display && !display.destroyed) {
            if(modelFor(tile)?.kind === "visualEffect") {
                display.width = appearance?.width ?? tile.width;
                display.height = appearance?.height ?? tile.height;
            }
            display.rotation = (appearance?.rotation ?? tile.rotation) * Math.PI / 180;
        }
        if (object?.controls && !object.destroyed && !object.controls.destroyed) {
            object.controls.shape.updateSource({ x: point.x, y: point.y, ...(appearance ?? {}) });
            object.controls.refresh();
        }
        Hooks.callAll("arcaneAdventSceneObjectPosition", tile, point, appearance);
    }
    function forget(tile, flight) {
        const motion = tile?.getFlag?.(SCOPE, "objectMotion") ?? tile?.flags?.[SCOPE]?.objectMotion;
        if (motion) {
            if (game.users?.activeGM?.isSelf && motion.id === flight?.id) tile.update({ "flags.arcane-advent.objectMotion": null }, { sceneObjectSync: true }).catch(error => ui.notifications.error(error.message));
            return;
        }
        if (!flight || !game.users?.activeGM?.isSelf || !tile.parent.tiles.has(tile.id)
            || modelFor(tile)?.flight?.id !== flight.id) return;
        if (onComplete) { onComplete(tile, flight.id); return; }
        tile.update({ "flags.arcane-advent.sceneObject.flight": null }, { sceneObjectSync: true })
            .catch(error => ui.notifications.error(error.message));
    }
    function start(tile) {
        const key = tile.parent.id + "." + tile.id;
        const flight = sceneObjectFlight(tile), frame = projectileFrame(flight);
        const previous = running.get(key);
        if (previous?.id === flight?.id) return;
        previous?.stop();
        if (!frame || frame.done) { forget(tile, flight); return; }
        if (!canvas.ready || tile.parent.id !== canvas.scene?.id
            || (tile.levels?.size && !tile.levels.has(canvas.level?.id)) || tile.hidden) return;
        const ticker = canvas.app.ticker, lights = new Map(), regions = new Set();
        let stopped = false, lastLight = -Infinity;
        const state = { id: flight.id, stop, tick };
        function stop(completed = false) {
            if (stopped) return;
            stopped = true;
            ticker.remove(tick);
            if (running.get(key) === state) running.delete(key);
            paint(tile, { x: tile.x, y: tile.y });
            for (const [object, original] of lights) {
                if (object._getLightSourceData === original.wrapper) {
                    if (original.own) object._getLightSourceData = original.method;
                    else delete object._getLightSourceData;
                }
                if (!object.destroyed) object.initializeLightSource();
            }
            for (const object of regions) if (!object.destroyed) { object.position.set(0, 0); object.scale?.set(1); }
            if (completed) forget(tile, flight);
        }
        function tick() {
            if (stopped) return;
            if (!canvas.ready || canvas.scene?.id !== tile.parent.id || tile.hidden
                || !tile.parent.tiles.has(tile.id) || sceneObjectFlight(tile)?.id !== flight.id) return stop();
            const point = projectileFrame(flight);
            if (!point) return stop();
            const appearance = projectileAppearance(flight);
            paint(tile, point, appearance);
            const sizeRatio = appearance ? appearance.width / tile.width : 1;
            // Regions are purely visual boundaries here; no behavior is run along the trajectory.
            for (const region of tile.parent.regions ?? []) {
                const object = region.object, origin = region.shapes?.[0];
                if (!related(region, tile) || !object || !origin) continue;
                regions.add(object);
                object.scale?.set(sizeRatio);
                object.position.set(point.x - origin.x * sizeRatio, point.y - origin.y * sizeRatio);
            }
            const now = sceneClock();
            if (now - lastLight >= 33 || point.done) {
                lastLight = now;
                for (const light of tile.parent.lights ?? []) {
                    const object = light.object;
                    if (!related(light, tile) || !object || object.destroyed) continue;
                    if (!lights.has(object)) {
                        const original = { own: Object.hasOwn(object, "_getLightSourceData"), method: object._getLightSourceData };
                        // Keep the persisted document at B; native lighting reads the current visual position.
                        original.wrapper = function () {
                            const data = original.method.call(this), visual = projectileAppearance(sceneObjectFlight(tile));
                            const ratio = visual ? visual.width / tile.width : 1;
                            return { ...data, ...sceneObjectPosition(tile), ...(visual ? {
                                dim: data.dim * ratio, bright: data.bright * ratio } : {}) };
                        };
                        object._getLightSourceData = original.wrapper;
                        lights.set(object, original);
                    }
                    object.initializeLightSource();
                }
            }
            if (point.done) stop(true);
        }
        running.set(key, state);
        // Apply motion after placeable render flags, before primary geometry and perception.
        ticker.add(tick, undefined, (PIXI.UPDATE_PRIORITY.INTERFACE ?? (PIXI.UPDATE_PRIORITY.HIGH ?? 50) - 3) - 1);
        tick();
    }
    function clear() { for (const state of [...running.values()]) state.stop(); }
    Hooks.on("canvasReady", () => { clear(); for (const tile of canvas.scene.tiles) start(tile); });
    Hooks.on("canvasTearDown", clear);
    Hooks.on("updateTile", tile => {
        const flight = sceneObjectFlight(tile), state = running.get(tile.parent.id + "." + tile.id);
        if (state && (state.id !== flight?.id || tile.hidden)) state.stop();
        start(tile);
    });
    Hooks.on("createTile", start);
    Hooks.on("drawTile", object => {
        start(object.document);
        running.get(object.document.parent.id + "." + object.document.id)?.tick();
    });
    Hooks.on("deleteTile", tile => running.get(tile.parent.id + "." + tile.id)?.stop());
}
