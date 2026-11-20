import { sceneMist, sceneLightEnabled } from "./scene-visual-settings.mjs";
import { sceneClock, sceneObjectPosition } from "./scene-projectiles.mjs";

export const SCENE_OBJECT_TYPES = Object.freeze(["sceneryElement", "interactiveElement", "visualEffect"]);
export const SCENE_OBJECT_QUERY = "arcane-advent.sceneObjects";
const SCOPE = "arcane-advent";
const ANCHOR = "systems/arcane-advent/assets/scene-effect-anchor.svg";
let operations = Promise.resolve();
const pending = new Map();

function serialize(tile, operation) {
    const key = `${tile.parent.id}.${tile.id}`;
    const result = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
    pending.set(key, result);
    const clear = () => { if (pending.get(key) === result) pending.delete(key); };
    result.then(clear, clear);
    return result;
}
const copy = value => JSON.parse(JSON.stringify(value));
export const sceneObject = tile => tile?.getFlag?.(SCOPE, "sceneObject") ?? tile?.flags?.[SCOPE]?.sceneObject;

export function sceneScale(scene) {
    const scale = scene.grid.size / scene.grid.distance;
    if (!Number.isFinite(scale) || scale <= 0) throw Error("L’échelle de la scène est invalide.");
    return scale;
}

function boundedPosition(scene, position) {
    const width = scene.dimensions?.width ?? scene.width;
    const height = scene.dimensions?.height ?? scene.height;
    const x = Number(position.x), y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height) {
        throw Error("Choisissez une position dans la scène.");
    }
    return { x: Math.round(x), y: Math.round(y) };
}

export function sceneObjectPlan(item, scene, position) {
    if (!SCENE_OBJECT_TYPES.includes(item?.type)) throw Error("Ce modèle ne peut pas être placé sur une scène.");
    const system = item.system.toObject ? item.system.toObject() : copy(item.system);
    const { placement, light, interaction } = system;
    const mist = sceneMist({ ...system, kind: item.type });
    light.enabled = sceneLightEnabled({ ...system, kind: item.type });
    const scale = sceneScale(scene);
    const visual = item.type === "visualEffect";
    const width = (visual ? 2 * placement.radius : placement.width) * scale;
    const height = (visual ? 2 * placement.radius : placement.height) * scale;
    if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw Error("Les dimensions sont invalides.");
    if (!/^#[0-9a-f]{6}$/i.test(light.color) || !/^#[0-9a-f]{6}$/i.test(mist.color)) throw Error("La couleur du modèle est invalide.");
    const point = boundedPosition(scene, position);
    return {
        name: item.name, ...point, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)),
        texture: { src: placement.image || (visual ? ANCHOR : item.img), anchorX: 0.5, anchorY: 0.5 },
        alpha: placement.opacity, rotation: placement.rotation, elevation: placement.elevation,
        flags: { [SCOPE]: { sceneObject: {
            kind: item.type, sourceUuid: item.uuid, sourceImage: item.img, name: item.name,
            description: system.interactions || system.description || "", placement, light, mist,
            movable: item.type === "interactiveElement" && interaction.movable,
            toggleLight: item.type === "interactiveElement" && interaction.toggleLight,
            active: light.initiallyOn, showBoundary: system.showBoundary,
            projectileDuration: system.projectileDuration ?? 0.8, animation: system.animation
        } } }
    };
}

export function sceneObjectChildren(tile) {
    const related = entry => entry.getFlag?.(SCOPE, "sceneObjectParent") === tile.id
        || entry.flags?.[SCOPE]?.sceneObjectParent === tile.id;
    return {
        lights: [...(tile.parent.lights ?? [])].filter(related),
        regions: [...(tile.parent.regions ?? [])].filter(related)
    };
}

export function sceneObjectChildData(tile) {
    const model = sceneObject(tile);
    if (!model) return null;
    const scale = sceneScale(tile.parent);
    const visual = model.kind === "visualEffect";
    const radius = visual ? Math.max(tile.width, tile.height) / 2 / scale : null;
    const flags = { [SCOPE]: { sceneObjectParent: tile.id } };
    const mist = sceneMist(model);
    const light = sceneLightEnabled(model) ? {
        name: model.name + (model.light.negative ? " — Obscurité" : " — Lumière"),
        x: tile.x, y: tile.y, elevation: tile.elevation, walls: model.light.walls, vision: false,
        hidden: tile.hidden || !model.active, flags, levels: [...(tile.levels ?? [])],
        config: {
            negative: Boolean(model.light.negative), priority: model.light.priority ?? 0,
            dim: visual ? radius : model.light.dim, bright: visual ? 0 : model.light.bright,
            color: model.light.color, alpha: model.light.alpha, luminosity: model.light.luminosity,
            animation: {
                type: Object.hasOwn((model.light.negative ? CONFIG.Canvas.darknessAnimations : CONFIG.Canvas.lightAnimations) ?? {},
                    model.light.animation) ? model.light.animation : null,
                speed: model.light.speed, intensity: Math.max(1, model.light.intensity), reverse: model.light.reverse
            }
        }
    } : null;
    const region = visual ? {
        name: model.name, color: mist.enabled ? mist.color : model.light.color,
        hidden: Boolean(tile.hidden || !model.active), locked: true,
        shapes: [{ type: "circle", x: tile.x, y: tile.y, radius: radius * scale, gridBased: false }],
        visibility: model.showBoundary ? CONST.REGION_VISIBILITY.ALWAYS : CONST.REGION_VISIBILITY.LAYER_UNLOCKED,
        highlightMode: "shapes", displayMeasurements: model.showBoundary, flags,
        levels: [...(tile.levels ?? [])]
    } : null;
    return { light, region };
}

async function synchronize(tile) {
    if (!tile.parent.tiles.has(tile.id)) return;
    const data = sceneObjectChildData(tile);
    if (!data) return;
    const children = sceneObjectChildren(tile);
    for (const [type, list, source] of [["AmbientLight", children.lights, data.light], ["Region", children.regions, data.region]]) {
        if (!source) {
            if (list.length) await tile.parent.deleteEmbeddedDocuments(type, list.map(child => child.id), { sceneObjectSync: true });
            continue;
        }
        if (list.length) {
            await tile.parent.updateEmbeddedDocuments(type, list.map(child => ({ _id: child.id, ...copy(source) })), { sceneObjectSync: true });
        } else {
            await tile.parent.createEmbeddedDocuments(type, [copy(source)], { sceneObjectSync: true });
        }
    }
}

export function syncSceneObject(tile) { return serialize(tile, () => synchronize(tile)); }

export function removeSceneObjectChildren(tile) { return serialize(tile, () => removeChildren(tile)); }

async function removeChildren(tile) {
    const children = sceneObjectChildren(tile);
    for (const [type, list] of [["AmbientLight", children.lights], ["Region", children.regions]]) {
        if (list.length) await tile.parent.deleteEmbeddedDocuments(type, list.map(child => child.id), { sceneObjectSync: true });
    }
}

export async function placeSceneObject(item, scene = canvas.scene, position) {
    if (!game.user.isGM || !scene) throw Error("Le MJ doit ouvrir une scène pour y déposer un modèle.");
    const center = canvas.scene?.id === scene.id ? canvas.stage?.pivot : null;
    position ??= center ? { x: center.x, y: center.y } : { x: scene.width / 2, y: scene.height / 2 };
    const source = sceneObjectPlan(item, scene, position);
    if (canvas.scene?.id === scene.id && canvas.level?.id) source.levels = [canvas.level.id];
    return createSceneObjectFromPlan(scene, source);
}

export async function createSceneObjectFromPlan(scene, source) {
    if (!game.user.isGM || !scene) throw Error("Le MJ doit choisir une scène.");
    const [tile] = await scene.createEmbeddedDocuments("Tile", [source], { sceneObjectSync: true });
    if (!tile) throw Error("L’objet n’a pas pu être déposé.");
    try {
        await syncSceneObject(tile);
        return tile;
    } catch (error) {
        await removeSceneObjectChildren(tile);
        await scene.deleteEmbeddedDocuments("Tile", [tile.id], { sceneObjectSync: true });
        throw error;
    }
}

export async function deleteSceneObject(tile) {
    await removeSceneObjectChildren(tile);
    await tile.parent.deleteEmbeddedDocuments("Tile", [tile.id], { sceneObjectSync: true });
}

export function sceneObjectAccess(tile, user = game.user) {
    const model = sceneObject(tile);
    if (!model) return { visible: false, movable: false, toggleLight: false };
    const inLevel = !tile.levels?.size || tile.levels.has(user.viewedLevel);
    const visible = user.isGM || (!tile.hidden && inLevel && tile.parent.id === user.viewedScene
        && (model.movable || (sceneLightEnabled(model) && model.toggleLight)));
    return {
        visible,
        movable: visible && (user.isGM || model.movable),
        toggleLight: visible && (sceneLightEnabled(model) || (user.isGM && sceneMist(model).enabled))
            && (user.isGM || model.toggleLight)
    };
}

export async function processSceneObjectAction(data, user) {
    if (!game.user.isGM || !user) throw Error("Cette action doit être traitée par le MJ.");
    const scene = game.scenes.get(data?.sceneId);
    const tile = scene?.tiles.get(data?.tileId);
    const access = sceneObjectAccess(tile, user);
    if (!access.visible) throw Error("Cet objet n’est pas accessible.");
    if (tile.locked && !user.isGM) throw Error("Cet objet a été verrouillé par le MJ.");
    let changes;
    if (data.action === "light" && access.toggleLight && typeof data.active === "boolean") {
        changes = { "flags.arcane-advent.sceneObject.active": data.active };
    } else if (data.action === "move" && access.movable) {
        changes = boundedPosition(scene, { x: data.x, y: data.y });
    } else if (data.action === "rotate" && access.movable && Number.isFinite(data.rotation)) {
        changes = { rotation: ((data.rotation % 360) + 360) % 360 };
    } else if (data.action === "project" && user.isGM && sceneObject(tile).kind === "visualEffect") {
        if (typeof data.duration !== "number" || !Number.isFinite(data.duration)
            || data.duration < 0.1 || data.duration > 10) throw Error("La durée du trajet doit être comprise entre 0,1 et 10 secondes.");
        const from = boundedPosition(scene, data.from ?? {}), to = boundedPosition(scene, data.to ?? {});
        if (from.x === to.x && from.y === to.y) throw Error("Choisissez deux points différents.");
        changes = { ...to, hidden: false, "flags.arcane-advent.sceneObject.active": true,
            "flags.arcane-advent.sceneObject.flight": {
                id: foundry.utils.randomID(), from, to, startedAt: sceneClock() + 150,
                duration: Math.round(data.duration * 1000)
            } };
    } else throw Error("Cette action n’est pas autorisée pour cet objet.");
    if (data.action !== "project" && sceneObject(tile).flight) changes["flags.arcane-advent.sceneObject.flight"] = null;
    await tile.update(changes, { sceneObjectSync: true });
    await syncSceneObject(tile);
    return { ok: true };
}

export async function requestSceneObjectAction(tile, action, values = {}) {
    const gm = game.users.activeGM;
    if (!gm) throw Error("Un MJ doit être connecté pour interagir avec les objets.");
    const data = { ...values, sceneId: tile.parent.id, tileId: tile.id, action };
    const result = gm.isSelf
        ? await CONFIG.queries[SCENE_OBJECT_QUERY](data, { user: game.user })
        : await gm.query(SCENE_OBJECT_QUERY, data, { timeout: 30000 });
    if (result?.error) throw Error(result.error);
    if (!result?.ok) throw Error("L’action n’a pas été confirmée par le MJ.");
    return result;
}

export function chooseSceneObjectPosition(message = "Cliquez sur la destination. Échap ou clic droit pour annuler.") {
    if (!canvas.ready) return Promise.resolve(null);
    ui.notifications.info(message);
    const stage = canvas.stage, view = canvas.app?.view;
    const native = typeof view?.addEventListener === "function";
    return new Promise(resolve => {
        let finished = false;
        const finish = point => {
            if (finished) return;
            finished = true;
            if (native) view.removeEventListener("pointerdown", click, true);
            else stage.off("pointerdown", click);
            document.removeEventListener("keydown", escape, true);
            Hooks.off("canvasTearDown", teardown);
            resolve(point);
        };
        const click = event => {
            if (event.button !== 0 && event.button !== 2) return;
            if (native) { event.preventDefault(); event.stopPropagation(); }
            if (event.button === 2) return finish(null);
            const point = native
                ? canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY })
                : event.getLocalPosition(stage);
            finish({ x: point.x, y: point.y });
        };
        const escape = event => {
            if (event.key !== "Escape") return;
            event.preventDefault?.();
            event.stopPropagation?.();
            finish(null);
        };
        const teardown = Hooks.on("canvasTearDown", () => finish(null));
        if (native) view.addEventListener("pointerdown", click, true);
        else stage.on("pointerdown", click);
        document.addEventListener("keydown", escape, true);
    });
}

function pointInsideTile(tile, point) {
    const radians = -(tile.rotation ?? 0) * Math.PI / 180;
    const position = sceneObjectPosition(tile);
    const dx = point.x - position.x, dy = point.y - position.y;
    return Math.abs(dx * Math.cos(radians) - dy * Math.sin(radians)) <= tile.width / 2
        && Math.abs(dx * Math.sin(radians) + dy * Math.cos(radians)) <= tile.height / 2;
}

export function registerSceneObjects({ openPanel, openInteraction }) {
    CONFIG.queries[SCENE_OBJECT_QUERY] = (data, { user }) => {
        const result = operations.then(() => processSceneObjectAction(data, user)).catch(error => ({ error: error.message }));
        operations = result.then(() => {});
        return result;
    };
    Hooks.on("dropCanvasData", (_canvas, data) => {
        if (data.type !== "Item" || !data.uuid || !game.user.isGM) return;
        const scene = canvas.scene;
        // Resolve asynchronously so unopened compendium models work as well as world Items.
        fromUuid(data.uuid).then(item => {
            if (SCENE_OBJECT_TYPES.includes(item?.type)) return placeSceneObject(item, scene, { x: data.x, y: data.y });
        }).catch(error => ui.notifications.error(error.message));
    });
    Hooks.on("createTile", (tile, options) => {
        if (!sceneObject(tile) || options.sceneObjectSync || !game.users.activeGM?.isSelf) return;
        syncSceneObject(tile).catch(error => ui.notifications.error(error.message));
    });
    Hooks.on("updateTile", (tile, changes, options) => {
        if (!sceneObject(tile) || options.sceneObjectSync || !game.users.activeGM?.isSelf) return;
        syncSceneObject(tile).catch(error => ui.notifications.error(error.message));
    });
    Hooks.on("deleteTile", (tile, options) => {
        if (!sceneObject(tile) || options.sceneObjectSync || !game.users.activeGM?.isSelf) return;
        removeSceneObjectChildren(tile).catch(error => ui.notifications.error(error.message));
    });
    Hooks.on("renderItemDirectory", (_app, html) => {
        const root = html instanceof HTMLElement ? html : html[0];
        const footer = root?.querySelector(".directory-footer");
        if (!footer || footer.querySelector("[data-open-scene-objects]")) return;
        const button = document.createElement("button");
        button.type = "button"; button.dataset.openSceneObjects = "";
        button.textContent = "Animations";
        button.addEventListener("click", openPanel);
        footer.append(button);
    });
    let stage, listener, lastTap;
    Hooks.on("canvasReady", () => {
        if (stage && listener) stage.off("pointertap", listener);
        stage = canvas.stage;
        if (game.users.activeGM?.isSelf) {
            for (const tile of canvas.scene.tiles) {
                if (sceneObject(tile)) syncSceneObject(tile).catch(error => ui.notifications.error(error.message));
            }
        }
        listener = event => {
            if (!canvas.tokens.active || event.button !== 0) return;
            const point = event.getLocalPosition(stage);
            const now = performance.now();
            const doubleTap = lastTap && now - lastTap.time < 400
                && Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) < 15 / stage.scale.x;
            lastTap = { time: now, point };
            if (!doubleTap) return;
            lastTap = null;
            if (canvas.tokens.placeables.some(token => token.visible && token.bounds.contains(point.x, point.y))) return;
            const tile = [...canvas.scene.tiles].reverse().find(tile => sceneObjectAccess(tile).visible
                && (!tile.levels?.size || tile.levels.has(canvas.level?.id)) && pointInsideTile(tile, point));
            if (tile) openInteraction(tile);
        };
        stage.on("pointertap", listener);
    });
    Hooks.on("canvasTearDown", () => {
        if (stage && listener) stage.off("pointertap", listener);
        stage = listener = lastTap = null;
    });
}
