import { isGroundTemplate, storageTokenModel } from "./storage.mjs";
import { inventorySource } from "./inventory-source.mjs";

const SCOPE = "arcane-advent";
const MIGRATION = "storage-migration";

// Copy first, repoint every token, then remove the old Actor. Origin markers
// allow a failed conversion to resume without creating duplicate inventories.
export async function migrateStorageActors() {
    if (!game.users.activeGM?.isSelf) return;
    for (const actor of game.actors.filter(actor => actor.type === "storage" && !isGroundTemplate(actor))) {
        const busy = actor.getFlag(SCOPE, "inventoryBusy");
        if (busy && busy !== MIGRATION) continue;
        try {
            await actor.setFlag(SCOPE, "inventoryBusy", MIGRATION);
            const copy = async source => {
                let item = game.items.find(item => item.type === "storage" && item.getFlag(SCOPE, "storageOrigin") === source.uuid);
                if (!item) item = await Item.create({ name: source.name, type: "storage", img: source.img,
                    ownership: inventorySource(source.ownership ?? {}),
                    flags: { [SCOPE]: { storageOrigin: source.uuid, legacyStorageActorId: actor.id, inventoryBusy: MIGRATION } },
                    system: { ground: source.system.ground, locked: source.system.locked,
                        contents: [...source.items].map(item => inventorySource(item.toObject())) } });
                await item.setFlag(SCOPE, "inventoryBusy", MIGRATION);
                return item;
            };
            const shared = await copy(actor);
            for (const scene of game.scenes) {
                for (const token of scene.tokens.filter(token => token.actorId === actor.id)) {
                    const item = token.actorLink ? shared : await copy(token.actor);
                    const model = await storageTokenModel();
                    await scene.updateEmbeddedDocuments("Token", [{ _id: token.id, actorId: model.id, actorLink: false,
                        "flags.arcane-advent.storageItemId": item.id,
                        delta: { name: token.name, img: item.img } }]);
                    if (token.actorId !== model.id || token.getFlag(SCOPE, "storageItemId") !== item.id) {
                        throw new Error("Le jeton n’a pas été converti.");
                    }
                }
            }
            if ([...game.scenes].some(scene => scene.tokens.some(token => token.actorId === actor.id))) {
                throw new Error("Un jeton utilise encore l’ancien stockage.");
            }
            await actor.delete();
            for (const item of game.items.filter(item => item.getFlag(SCOPE, "legacyStorageActorId") === actor.id)) {
                await item.unsetFlag(SCOPE, "inventoryBusy");
            }
        } catch (error) {
            console.error("Arcane Advent | Conversion du stockage", actor.uuid, error);
            ui.notifications.error(`Conversion interrompue pour « ${actor.name} ». Les données sont conservées et verrouillées ; rechargez pour reprendre.`);
        }
    }
    // Resume the last step if a connection failed after deleting the old Actor.
    for (const item of game.items.filter(item => item.type === "storage"
        && item.getFlag(SCOPE, "inventoryBusy") === MIGRATION
        && item.getFlag(SCOPE, "legacyStorageActorId")
        && !game.actors.get(item.getFlag(SCOPE, "legacyStorageActorId")))) {
        try { await item.unsetFlag(SCOPE, "inventoryBusy"); }
        catch (error) { console.error("Arcane Advent | Déverrouillage du stockage converti", item.uuid, error); }
    }
}
