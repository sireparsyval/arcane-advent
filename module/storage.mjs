import { executeTransfer, transferPlan } from "./inventory-transfer.mjs";
import { inventoryForDocument, inventoryForToken, StorageInventory } from "./storage-inventory.mjs";
import { animateSceneObject, objectCenter, objectMotionPlan } from "./scene-object-motion.mjs";

export const STORAGE_IMAGE = "assets/arcane-advent/entities/objects/item-stash.png";
export const STORAGE_QUERY = "arcane-advent.inventory";
export const inventoryActor = actor => ["character", "npc", "storage"].includes(actor?.type);
export const isGroundTemplate = actor => actor?.type === "storage" && !actor.isToken
    && actor.getFlag("arcane-advent", "groundTemplate") === true;
export const isGroundDeposit = actor => actor?.type === "storage" && actor.system.ground && !isGroundTemplate(actor);
export const storageAccess = (actor, user = game.user) => actor?.type === "storage"
    && !isGroundTemplate(actor)
    && (user.isGM || (!actor.system.locked && actor.testUserPermission(user, "OBSERVER")
        && game.scenes.get(user.viewedScene)?.tokens.some(token => !token.hidden && inventoryForToken(token)?.uuid === actor.uuid)));

let queue = Promise.resolve();
const requests = new Map();

function requireSceneToken(token, actor, user) {
    if (token?.documentName !== "Token" || inventoryForToken(token)?.uuid !== actor.uuid
        || (!user.isGM && (token.parent.id !== user.viewedScene || token.hidden))) {
        throw new Error("Ce jeton n’est pas accessible sur votre scène.");
    }
}

function groundTokenSize(value = 1) {
    if (!Number.isFinite(value) || value < 0.1) throw new Error("La taille sur scène doit être d’au moins 0,1 case.");
    return value;
}

export async function createStorage({ name = "Objets au sol", scene = null, x, y, ground = false, img, snap = true, size = 1 } = {}) {
    if (!game.user.isGM) throw new Error("La création d’un stockage nécessite le MJ.");
    size = groundTokenSize(size);
    img ||= game.settings.get("arcane-advent", "storageImage") || STORAGE_IMAGE;
    if (ground && !scene) throw new Error("Choisissez une scène pour le dépôt au sol.");
    const document = await Item.create({ name, type: "storage", img,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        system: { ground, locked: false, contents: [], groundTokenSize: size } });
    if (!document) throw new Error("Le stockage n’a pas pu être créé dans le répertoire Objets.");
    const storage = inventoryForDocument(document);
    try {
        if (scene) await placeStorage(storage, scene, { x, y, snap });
        return storage;
    } catch (error) {
        await document.delete();
        throw error;
    }
}

export async function storageTokenModel() {
    let template = game.actors.find(isGroundTemplate);
    if (!template) template = await Actor.create({ name: "Modèle — Jetons de stockage", type: "storage",
        img: game.settings.get("arcane-advent", "storageImage") || STORAGE_IMAGE,
        flags: { "arcane-advent": { groundTemplate: true } },
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        system: { ground: false, locked: true },
        prototypeToken: { actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            width: 1, height: 1, bar1: { attribute: null }, bar2: { attribute: null } } });
    return template;
}

export async function placeStorage(actor, scene = canvas.scene, position = {}) {
    actor = inventoryForDocument(actor);
    if (!game.user.isGM || actor?.type !== "storage" || !scene) throw new Error("Ouvrez une scène en tant que MJ.");
    if (actor.isToken || isGroundTemplate(actor)) {
        throw new Error("Ce dépôt est déjà présent sur sa scène.");
    }
    const size = scene.grid.size;
    const itemStorage = actor instanceof StorageInventory;
    const model = itemStorage ? await storageTokenModel() : actor;
    const side = itemStorage ? groundTokenSize(actor.system.groundTokenSize ?? 1) : null;
    const width = side ?? model.prototypeToken?.width ?? 1;
    const height = side ?? model.prototypeToken?.height ?? 1;
    const pixelWidth = width * size, pixelHeight = height * size;
    if (pixelWidth > scene.width || pixelHeight > scene.height) throw new Error("La taille du jeton dépasse celle de la scène.");
    const center = canvas.stage?.pivot ?? { x: scene.width / 2, y: scene.height / 2 };
    const coordinate = (value,max) => Math.max(0,Math.min(max,position.snap===false?value:Math.round(value/size)*size));
    const x = coordinate(position.x ?? center.x-pixelWidth/2,scene.width-pixelWidth);
    const y = coordinate(position.y ?? center.y-pixelHeight/2,scene.height-pixelHeight);
    const token = await model.getTokenDocument({ x, y, width, height, ...(itemStorage ? {
        name: actor.name, actorLink: false, texture: { src: actor.img },
        flags: { "arcane-advent": { storageItemId: actor.id } }, delta: { name: actor.name, img: actor.img }
    } : {}) }, { parent: scene });
    const created = await scene.createEmbeddedDocuments("Token", [token.toObject()]);
    if (!created.length) throw new Error("Le jeton de stockage n’a pas pu être créé.");
    return created;
}

async function deleteEmptyGround(actor) {
    if (!isGroundDeposit(actor) || actor.items.size !== 0) return false;
    if (actor instanceof StorageInventory) {
        for (const scene of game.scenes) {
            const ids = scene.tokens.filter(token => inventoryForToken(token)?.uuid === actor.uuid).map(token => token.id);
            if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
        }
        await actor.delete();
    } else if (actor.isToken) {
        await actor.token.parent.deleteEmbeddedDocuments("Token", [actor.token.id]);
    } else {
        // Older deposits used a world Actor. Preserve any independent copies
        // that still rely on it while removing its linked scene tokens.
        let hasCopies = false;
        for (const scene of game.scenes) {
            const tokens = scene.tokens.filter(token => token.actorId === actor.id);
            hasCopies ||= tokens.some(token => !token.actorLink);
            const ids = tokens.filter(token => token.actorLink).map(token => token.id);
            if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
        }
        if (!hasCopies) await actor.delete();
    }
    return true;
}

async function processRequest(data, user) {
    if (!game.user.isGM) throw new Error("Le MJ doit traiter le transfert.");
    const source = inventoryForDocument(await fromUuid(data.source));
    if (!inventoryActor(source) || source.pack
        || !(source.type === "storage" ? storageAccess(source, user) : source.testUserPermission(user, "OWNER"))) {
        throw new Error("Vous n’avez pas accès à cet inventaire.");
    }
    if (!Array.isArray(data.selections) || !data.selections.length || data.selections.length > 1000) {
        throw new Error("Sélectionnez au moins un objet.");
    }
    let destination;
    let groundCreated = false;
    if (data.action === "drop" || data.action === "throw") {
        const token = await fromUuid(data.sourceToken);
        requireSceneToken(token, source, user);
        for (const selection of data.selections) {
            const configuredSize = source.items.get(selection.id)?.system.groundTokenSize;
            if (configuredSize != null) groundTokenSize(configuredSize);
        }
        const preview = transferPlan(source.items, data.selections, foundry.utils.randomID);
        const roots = preview.creates.filter(item => !item.system.containerId);
        const single = roots.length === 1 ? roots[0] : null;
        const thrown = data.action === "throw";
        const center = objectCenter(token), size = token.parent.grid.size;
        const side = groundTokenSize(single?.system.groundTokenSize ?? 1), extent = side * size;
        if (thrown) {
            const weapon = source.items.get(data.selections[0]?.id);
            if(data.selections.length!==1||weapon?.type!=="weapon"||weapon.system.corporeal||!weapon.system.equipped
                ||!new Set(weapon.system.properties).has("thrown"))throw Error("Choisissez une arme Lancer équipée et non corporelle.");
            if (center.x-extent/2 < 0 || center.y-extent/2 < 0
                || center.x+extent/2 > token.parent.width || center.y+extent/2 > token.parent.height) {
                throw new Error("Le jeton de l’objet lancé doit tenir dans la scène à son point de départ.");
            }
            objectMotionPlan({documentName:"Token",parent:token.parent,x:center.x-extent/2,y:center.y-extent/2,width:side,height:side,rotation:0},data.points,data.motion);
        }
        destination = await createStorage({ name: single?.name || "Objets au sol",
            img: single?.system.groundTokenImage?.trim() || (thrown ? single?.img : undefined), scene: token.parent,
            x: thrown ? center.x-extent/2 : token.x + token.width * size, y: thrown ? center.y-extent/2 : token.y,
            ground: true, snap: !thrown, size: side });
        groundCreated = true;
    } else if (data.action === "transfer") {
        const token = await fromUuid(data.targetToken);
        destination = inventoryForToken(token);
        if (!inventoryActor(destination) || destination.pack) throw new Error("Ciblez un personnage ou un stockage.");
        requireSceneToken(token, destination, user);
        if (destination.type === "storage" && !storageAccess(destination, user)) throw new Error("Ce stockage est verrouillé ou inaccessible.");
    } else throw new Error("Action inconnue.");

    const actors = [...new Set([source, destination])];
    const locked = [];
    let result;
    try {
        for (const actor of actors) {
            if (actor.getFlag("arcane-advent", "inventoryBusy")) {
                throw new Error("Cet inventaire est déjà utilisé. Le MJ peut débloquer une opération interrompue depuis Stockages.");
            }
            await actor.setFlag("arcane-advent", "inventoryBusy", data.requestId);
            locked.push(actor);
        }
        result = await executeTransfer(source, destination, data.selections, foundry.utils.randomID);
        if (data.action === "throw") {
            const token = [...game.scenes].flatMap(scene=>[...scene.tokens]).find(token=>inventoryForToken(token)?.uuid===destination.uuid);
            try { if(!token)throw Error("Jeton du dépôt introuvable.");await animateSceneObject(token,data.points,data.motion); }
            catch(error){result.warning=`L’arme est déposée au sol, mais son animation a échoué : ${error.message}`;}
        }
    } finally {
        for (const actor of locked) await actor.unsetFlag("arcane-advent", "inventoryBusy");
        // An empty deposit created for a failed operation can be removed safely.
        if (groundCreated && destination.items.size === 0) {
            await deleteEmptyGround(destination);
        }
    }
    if (data.deleteEmptyGround === true && isGroundDeposit(source) && source.items.size === 0) {
        try { result.deletedGround = await deleteEmptyGround(source); }
        catch (error) {
            console.error("Arcane Advent | Suppression du dépôt vide", error);
            result.warning = "Les objets ont été transférés, mais le dépôt vide n’a pas pu être supprimé.";
        }
    }
    return result;
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

export async function requestInventoryAction(actor, selections, { action, sourceToken, targetToken, deleteEmptyGround = false, points, motion }) {
    const gm = game.users.activeGM;
    if (!gm) throw new Error("Un MJ doit être connecté pour déplacer les objets.");
    const data = { requestId: foundry.utils.randomID(), source: actor.uuid,
        selections, action, sourceToken, targetToken, deleteEmptyGround: deleteEmptyGround === true, points, motion };
    const result = gm.isSelf
        ? await CONFIG.queries[STORAGE_QUERY](data, { user: game.user })
        : await gm.query(STORAGE_QUERY, data, { timeout: 30000 });
    if (result?.error) throw new Error(result.error);
    if (!result?.count) throw new Error("Réponse du MJ interrompue. Vérifiez les inventaires avant de réessayer.");
    return result;
}
