import { executeTransfer } from "./inventory-transfer.mjs";

export const STORAGE_IMAGE = "assets/Arcane Advent/Entités/Objets/item.png";
export const STORAGE_QUERY = "arcane-advent.inventory";
export const inventoryActor = actor => ["character", "npc", "storage"].includes(actor?.type);
export const storageAccess = (actor, user = game.user) => actor?.type === "storage"
    && (user.isGM || (!actor.system.locked && actor.testUserPermission(user, "OBSERVER")
        && game.scenes.get(user.viewedScene)?.tokens.some(token => !token.hidden && token.actor?.uuid === actor.uuid)));

let queue = Promise.resolve();
const requests = new Map();

function requireSceneToken(token, actor, user) {
    if (token?.documentName !== "Token" || token.actor?.uuid !== actor.uuid
        || (!user.isGM && (token.parent.id !== user.viewedScene || token.hidden))) {
        throw new Error("Ce jeton n’est pas accessible sur votre scène.");
    }
}

export async function createStorage({ name = "Objets au sol", scene = null, x, y, ground = false } = {}) {
    if (!game.user.isGM) throw new Error("La création d’un stockage nécessite le MJ.");
    const img = game.settings.get("arcane-advent", "storageImage");
    const actor = await Actor.create({ name, type: "storage", img,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        system: { ground, locked: false },
        prototypeToken: { name, actorLink: true, texture: { src: img },
            disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, width: 1, height: 1,
            bar1: { attribute: null }, bar2: { attribute: null } } });
    try {
        if (scene) await placeStorage(actor, scene, { x, y });
        return actor;
    } catch (error) {
        await actor.delete();
        throw error;
    }
}

export async function placeStorage(actor, scene = canvas.scene, position = {}) {
    if (!game.user.isGM || actor.type !== "storage" || !scene) throw new Error("Ouvrez une scène en tant que MJ.");
    const size = scene.grid.size;
    const center = canvas.stage?.pivot ?? { x: scene.width / 2, y: scene.height / 2 };
    const x = Math.max(0, Math.min(scene.width - size, Math.round((position.x ?? center.x - size / 2) / size) * size));
    const y = Math.max(0, Math.min(scene.height - size, Math.round((position.y ?? center.y - size / 2) / size) * size));
    const token = await actor.getTokenDocument({ x, y });
    return scene.createEmbeddedDocuments("Token", [token.toObject()]);
}

async function processRequest(data, user) {
    if (!game.user.isGM) throw new Error("Le MJ doit traiter le transfert.");
    const source = await fromUuid(data.source);
    if (!inventoryActor(source) || source.pack
        || !(source.type === "storage" ? storageAccess(source, user) : source.testUserPermission(user, "OWNER"))) {
        throw new Error("Vous n’avez pas accès à cet inventaire.");
    }
    if (!Array.isArray(data.selections) || !data.selections.length || data.selections.length > 1000) {
        throw new Error("Sélectionnez au moins un objet.");
    }
    let destination;
    let groundCreated = false;
    if (data.action === "drop") {
        const token = await fromUuid(data.sourceToken);
        requireSceneToken(token, source, user);
        destination = await createStorage({ name: "Objets au sol", scene: token.parent,
            x: token.x + token.width * token.parent.grid.size, y: token.y, ground: true });
        groundCreated = true;
    } else if (data.action === "transfer") {
        const token = await fromUuid(data.targetToken);
        destination = token?.actor;
        if (!inventoryActor(destination) || destination.pack) throw new Error("Ciblez un personnage ou un stockage.");
        requireSceneToken(token, destination, user);
        if (destination.type === "storage" && !storageAccess(destination, user)) throw new Error("Ce stockage est verrouillé ou inaccessible.");
    } else throw new Error("Action inconnue.");

    const actors = [...new Set([source, destination])];
    const locked = [];
    try {
        for (const actor of actors) {
            if (actor.getFlag("arcane-advent", "inventoryBusy")) {
                throw new Error("Cet inventaire est déjà utilisé. Le MJ peut débloquer une opération interrompue depuis Stockages.");
            }
            await actor.setFlag("arcane-advent", "inventoryBusy", data.requestId);
            locked.push(actor);
        }
        return await executeTransfer(source, destination, data.selections, foundry.utils.randomID);
    } finally {
        for (const actor of locked) await actor.unsetFlag("arcane-advent", "inventoryBusy");
        // An empty deposit created for a failed operation can be removed safely.
        if (groundCreated && destination.items.size === 0) {
            for (const scene of game.scenes) {
                const ids = scene.tokens.filter(token => token.actorId === destination.id).map(token => token.id);
                if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
            }
            await destination.delete();
        }
    }
}

export function registerStorageService() {
    game.settings.register("arcane-advent", "storageImage", {
        name: "Image des dépôts au sol", hint: "Chemin de l’image par défaut des nouveaux sacs et stockages.",
        scope: "world", config: true, type: String, default: STORAGE_IMAGE,
        filePicker: "image"
    });
    // Foundry supplies the authenticated sender in the query context.
    CONFIG.queries[STORAGE_QUERY] = (data, { user }) => {
        if (!user || typeof data?.requestId !== "string" || data.requestId.length > 100) {
            return { error: "Demande invalide." };
        }
        const key = `${user.id}:${data.requestId}`;
        if (requests.has(key)) return requests.get(key);
        const result = queue.then(() => processRequest(data, user))
            .catch(error => ({ error: error.message }));
        queue = result.then(() => {});
        requests.set(key, result);
        // Keep successful/failed responses for this session to avoid replaying a
        // timed-out transfer. Never automatically retry a request on a new GM.
        return result;
    };
}

export async function requestInventoryAction(actor, selections, { action, sourceToken, targetToken }) {
    const gm = game.users.activeGM;
    if (!gm) throw new Error("Un MJ doit être connecté pour déplacer les objets.");
    const data = { requestId: foundry.utils.randomID(), source: actor.uuid,
        selections, action, sourceToken, targetToken };
    const result = gm.isSelf
        ? await CONFIG.queries[STORAGE_QUERY](data, { user: game.user })
        : await gm.query(STORAGE_QUERY, data, { timeout: 30000 });
    if (result?.error) throw new Error(result.error);
    if (!result?.count) throw new Error("Réponse du MJ interrompue. Vérifiez les inventaires avant de réessayer.");
    return result;
}
