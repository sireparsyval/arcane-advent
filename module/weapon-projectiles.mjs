import { ammunitionItems, projectileArtwork } from "./weapon-ammunition.mjs";
import { objectCenter, objectMotionPlan } from "./scene-object-motion.mjs";

export function weaponProjectile(actor, weapon) {
    const stockId = weapon.system.ammunition?.itemId;
    const item = ammunitionItems(actor).find(item => item.id === stockId);
    if (item) return projectileArtwork(item);
    const previous = weapon.getFlag?.("arcane-advent", "lastProjectile");
    if (previous?.stockId === stockId) return previous;
    throw Error("Choisissez un stock de munitions dans les paramètres de l’arme pour son image de projectile.");
}
export function weaponShotPlan(actor, weapon, token, points) {
    if (weapon?.type !== "weapon" || !weapon.system.equipped || !weapon.system.properties.has("ammunition")) {
        throw Error("Choisissez une arme Distance équipée.");
    }
    const artwork = weaponProjectile(actor, weapon), scene = token.parent;
    const size = Math.max(1, Math.round(artwork.size * scene.grid.size));
    const from = objectCenter(token);
    if (!Array.isArray(points)) throw Error("Tracez la trajectoire du projectile.");
    const route = points.map(point => ({ x: Math.round(point?.x), y: Math.round(point?.y) }));
    const motion = objectMotionPlan({ documentName: "Tile", parent: scene, x: Math.round(from.x), y: Math.round(from.y),
        width: size, height: size, rotation: 0 }, route, weapon.system.projection ?? { rotation: "direction" }, { imageOffset: artwork.offset });
    const flight = motion["flags.arcane-advent.objectMotion"];
    return { name: artwork.name, x: motion.x, y: motion.y, rotation: motion.rotation, width: size, height: size,
        texture: { src: artwork.img, anchorX: 0.5, anchorY: 0.5 }, alpha: 1, hidden: Boolean(token.hidden),
        elevation: token.elevation ?? 0, levels: [...(token.levels ?? [])],
        flags: { "arcane-advent": { objectMotion: flight,
            weaponProjectile: { expiresAt: weapon.system.projection?.disappear === false ? null : flight.startedAt + flight.duration } } } };
}
export async function animateWeaponShot(actor, weapon, token, points) {
    // A shot is visual: the attack roll already consumed the ammunition.
    const data = weaponShotPlan(actor, weapon, token, points);
    const tiles = await token.parent.createEmbeddedDocuments("Tile", [data]);
    return { count: 1, projectileId: tiles[0].id };
}
