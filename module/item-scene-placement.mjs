import { isInventoryItem, EQUIPMENT_TYPES, canPlaceInContainer } from "./inventory.mjs";
import { inventorySource } from "./inventory-source.mjs";
import { groundItemAppearance } from "./ground-items.mjs";
import { createStorage, placeStorage } from "./storage.mjs";
import { inventoryForDocument, inventoryForToken } from "./storage-inventory.mjs";
import { placeSceneObject, SCENE_OBJECT_TYPES } from "./scene-objects.mjs";
import { syncItemSourceImage } from "./item-images.mjs";

function cloneContents(entries) {
    const sources = entries.map(entry => inventorySource(entry.toObject ? entry.toObject() : entry));
    const byId = new Map(sources.map(source => [source._id, { ...source, id: source._id }]));
    if (byId.size !== sources.length || sources.some(source => !isInventoryItem(source)
        || !canPlaceInContainer(byId, source._id, source.system.containerId))) throw Error("Le contenu du modèle est invalide.");
    const ids = new Map(sources.map(source => [source._id, foundry.utils.randomID()]));
    return sources.map(source => {
        source._id = ids.get(source._id); source.system.containerId = ids.get(source.system.containerId) ?? null;
        if (EQUIPMENT_TYPES.includes(source.type)) source.system.equipped = false;
        return source;
    });
}

export async function placeItemPreset(item, scene, position = {}) {
    if (!game.user.isGM || !scene) throw Error("Ouvrez une scène en tant que MJ pour déposer un modèle.");
    if (SCENE_OBJECT_TYPES.includes(item?.type)) return placeSceneObject(item, scene, position);
    if (!(isInventoryItem(item) || item?.type === "storage")) return null;
    if (item.actor) throw Error("Utilisez Déposer au sol pour retirer un objet de l’inventaire d’un personnage.");
    if (item.getFlag?.("arcane-advent", "inventoryBusy")) throw Error("Ce modèle est utilisé par une opération en cours.");
    if (item.type === "weapon" && item.system.corporeal) throw Error("Une arme corporelle ne peut pas être déposée comme un objet.");
    let copy;
    try {
        if (item.type === "storage") {
            const system = inventorySource(item.system.toObject ? item.system.toObject() : item.system);
            system.contents = cloneContents(system.contents ?? []);
            for (const entry of system.contents) await syncItemSourceImage(entry);
            const document = await Item.create({ type: "storage", name: item.name, img: item.img, system,
                flags: { "arcane-advent": { sceneInventoryInstance: true, sourceUuid: item.uuid } },
                ownership: inventorySource(item.ownership ?? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }) });
            if (!document) throw Error("Le stockage n’a pas pu être copié.");
            copy = inventoryForDocument(document);
            await placeStorage(copy, scene, position);
        } else {
            const source = inventorySource(item.toObject()); source._id = foundry.utils.randomID(); source.folder = null;
            source.system.containerId = null;
            if (EQUIPMENT_TYPES.includes(item.type)) source.system.equipped = false;
            await syncItemSourceImage(source);
            const appearance = groundItemAppearance(source);
            copy = await createStorage({ name: item.name, img: appearance.img, ground: true,
                scene, ...position, size: appearance.size, depth: appearance.depth });
            await copy.createEmbeddedDocuments("Item", [source], { keepId: true });
        }
        return copy;
    } catch (error) {
        if (copy) {
            for (const current of game.scenes) {
                const ids = current.tokens.filter(token => inventoryForToken(token)?.uuid === copy.uuid).map(token => token.id);
                if (ids.length) await current.deleteEmbeddedDocuments("Token", ids);
            }
            await copy.delete();
        }
        throw error;
    }
}

export function registerItemSceneDrops() {
    Hooks.on("dropCanvasData", (board, data) => {
        if (data.type !== "Item" || !data.uuid || !game.user.isGM) return;
        const scene = board.scene ?? canvas.scene, position = { x: data.x, y: data.y };
        fromUuid(data.uuid).then(item => placeItemPreset(item, scene, position)).catch(error => ui.notifications.error(error.message));
        return false;
    });
}
