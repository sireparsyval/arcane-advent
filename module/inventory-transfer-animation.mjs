import { groundItemAppearance } from "./ground-items.mjs";
import { inventoryForToken } from "./storage-inventory.mjs";
import { objectCenter, animateSceneObject } from "./scene-object-motion.mjs";
import { sceneClock, projectileAppearance } from "./scene-projectiles.mjs";

export function transferVisuals(plan) {
    const items = [...plan.creates, ...(plan.visuals ?? [])];
    const ids = new Set(items.map(item => item._id).filter(Boolean));
    return items.filter(item => !ids.has(item.system.containerId));
}
export function transferTileData(item, donor, receiver, { clock = sceneClock, id = () => foundry.utils.randomID() } = {}) {
    // BaseTile stores integer coordinates. Normalize the route as well as the
    // persisted position so its destination still matches after native cleaning.
    const center = token => {
        const point = objectCenter(token);
        return { x: Math.round(point.x), y: Math.round(point.y) };
    };
    const from = center(donor), to = center(receiver);
    const appearance = groundItemAppearance(item), size = Math.max(1, Math.round(appearance.size * donor.parent.grid.size));
    const flight = { id: id(), from, to, points: [from, to], startedAt: clock() + 150, duration: 250,
        visual: { width: size, height: size, rotation: 0, endScale: 1, spin: 0, rotationMode: "direction",
            offset: -(item.system.imageAngleOffset ?? 0) } };
    const final = projectileAppearance(flight, flight.startedAt + flight.duration);
    return { name: item.name, x: to.x, y: to.y, width: size, height: size, rotation: final.rotation,
        texture: { src: appearance.img, anchorX: 0.5, anchorY: 0.5 }, alpha: 1, hidden: Boolean(donor.hidden || receiver.hidden),
        sort: Math.max(0, ...Array.from(donor.parent.tiles ?? [], tile => tile.sort ?? 0)) + 1,
        elevation: donor.elevation ?? 0, levels: [...(donor.levels ?? [])],
        flags: { "arcane-advent": { objectMotion: flight, transferVisual: { expiresAt: flight.startedAt + flight.duration + 5000 } } } };
}
export function transfersEntireSource(source, plan) {
    const items = [...source.items];
    return source.type === "storage" && items.length > 0 && !(plan.updates?.length)
        && items.every(item => plan.deletes?.includes(item.id)) && transferVisuals(plan).length === 1;
}
export async function animateInventoryTransfer(source, receiver, plan, { removeSource = false } = {}) {
    const scene = receiver?.parent;
    if (!scene?.tiles || !scene.createEmbeddedDocuments) return;
    const donor = source.token?.parent?.id === scene.id ? source.token
        : [...scene.tokens].find(token => inventoryForToken(token)?.uuid === source.uuid);
    if (!donor) return;
    const from = objectCenter(donor), to = objectCenter(receiver);
    if (Math.hypot(to.x-from.x, to.y-from.y) < 1) return;
    if (removeSource && transfersEntireSource(source, plan)) {
        // A complete pickup moves the real token: no stationary copy remains.
        const previous = { x: donor.x, y: donor.y, rotation: donor.rotation ?? 0,
            "flags.arcane-advent.objectMotion": donor.getFlag("arcane-advent", "objectMotion") ?? null };
        const rollback = async () => {
            if (scene.tokens.has(donor.id)) await donor.update(previous, { animate: false, sceneObjectSync: true });
        };
        try {
            await animateSceneObject(donor, [from, to], { duration: 0.25, rotation: "direction" });
            await new Promise(resolve => setTimeout(resolve, 450));
            return { rollback };
        } catch (error) { await rollback(); throw error; }
    }
    const data = transferVisuals(plan).map(item => transferTileData(item, donor, receiver));
    if (!data.length) return;
    const ids = [];
    try {
        const tiles = await scene.createEmbeddedDocuments("Tile", data);
        ids.push(...tiles.map(tile => tile.id));
        await new Promise(resolve => setTimeout(resolve, 450));
    } finally {
        const remaining = ids.filter(id => scene.tiles.has(id));
        if (remaining.length) await scene.deleteEmbeddedDocuments("Tile", remaining);
    }
}
