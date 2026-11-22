import { groundItemAppearance } from "./ground-items.mjs";
import { isInventoryItem } from "./inventory.mjs";
import { inventorySource } from "./inventory-source.mjs";

const scenery = ["sceneryElement", "interactiveElement", "visualEffect"];
const placeholder = image => !image || image === "icons/svg/item-bag.svg";
function field(item, changes, path) {
    if (Object.hasOwn(changes, path)) return changes[path];
    const keys = path.split(".");
    let value = changes;
    for (const key of keys) { if (!value || !Object.hasOwn(value, key)) return keys.reduce((object, part) => object?.[part], item); value = value[key]; }
    return value;
}

export async function directoryImageChanges(item, changes = {}) {
    const type = changes.type ?? item.type, image = changes.img ?? item.img;
    let source;
    if (isInventoryItem({ type })) {
        const ground = field(item, changes, "system.groundTokenImage")?.trim();
        const changed = Object.hasOwn(changes, "system.groundTokenImage") || Object.hasOwn(changes.system ?? {}, "groundTokenImage");
        if (ground || changed || placeholder(image)) source = groundItemAppearance({ type, system: {
            groundTokenImage: ground ?? "", coinPile: field(item, changes, "system.coinPile"), coins: field(item, changes, "system.coins")
        } }).img;
    } else if (scenery.includes(type)) source = field(item, changes, "system.placement.image")?.trim();
    else if (type === "storage" && placeholder(image)) source = groundItemAppearance({ type }).img;
    if (!source) return {};
    if (/\.(?:webm|mp4|m4v|ogv)(?:[?#]|$)/i.test(source)) {
        if (item.flags?.["arcane-advent"]?.directoryVideoSource === source && !placeholder(image)) return {};
        try {
            const thumb = game.video.thumbs?.get(source) ?? await game.video.createThumbnail(source, { width: 128, height: 128 });
            return { img: thumb, "flags.arcane-advent.directoryVideoSource": source };
        } catch (error) {
            console.warn("Arcane Advent | Miniature vidéo indisponible", error);
            return placeholder(image) ? { img: "icons/svg/video.svg" } : {};
        }
    }
    const result = source === image ? {} : { img: source };
    if (item.flags?.["arcane-advent"]?.directoryVideoSource) result["flags.arcane-advent.directoryVideoSource"] = null;
    return result;
}

export async function syncItemSourceImage(source) {
    const changes = await directoryImageChanges(source);
    if (changes.img) source.img = changes.img;
    if (Object.hasOwn(changes, "flags.arcane-advent.directoryVideoSource")) {
        source.flags ??= {}; source.flags["arcane-advent"] ??= {};
        source.flags["arcane-advent"].directoryVideoSource = changes["flags.arcane-advent.directoryVideoSource"];
    }
    return source;
}

export async function migrateDirectoryImages() {
    if (!game.users.activeGM?.isSelf) return;
    const migrate = async item => {
        if (item.getFlag?.("arcane-advent", "inventoryBusy")) return;
        const changes = await directoryImageChanges(item);
        if (item.type === "storage" && item.system.contents?.length) {
            const contents = inventorySource(item.system.contents);
            for (const entry of contents) await syncItemSourceImage(entry);
            if (JSON.stringify(contents) !== JSON.stringify(item.system.contents)) changes["system.contents"] = contents;
        }
        if (Object.keys(changes).length) await item.update(changes);
    };
    for (const item of game.items) await migrate(item);
    const actors = new Set([...game.actors, ...[...game.scenes].flatMap(scene => [...scene.tokens].filter(token => !token.actorLink && token.actor).map(token => token.actor))]);
    for (const actor of actors) {
        if (actor.getFlag?.("arcane-advent", "inventoryBusy")) continue;
        for (const item of actor.items) await migrate(item);
    }
}
