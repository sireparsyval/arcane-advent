import { executeInventoryPlan, transferPlan } from "./inventory-transfer.mjs";
import { inventoryForDocument, inventoryForToken, StorageInventory } from "./storage-inventory.mjs";
import { animateSceneObject, objectCenter, objectMotionPlan } from "./scene-object-motion.mjs";
import { EQUIPMENT_TYPES, isInventoryContainer, isInventoryItem } from "./inventory.mjs";
import { groundItemAppearance, mainGroundContainer, storageContentItems, firstInventoryPurse, checkedCoins } from "./ground-items.mjs";
import { coinPlan, packStoragePlan } from "./inventory-ground-plans.mjs";
import { animateInventoryTransfer } from "./inventory-transfer-animation.mjs";
import { mergeStackPlan } from "./inventory-stacks.mjs";
import { animateWeaponShot } from "./weapon-projectiles.mjs";

export const STORAGE_IMAGE = "assets/arcane-advent/entities/objects/bag-item.png";
export const STORAGE_QUERY = "arcane-advent.inventory";
export const inventoryActor = actor => ["character", "npc", "storage"].includes(actor?.type);
export const isGroundTemplate = actor => actor?.type === "storage" && !actor.isToken
    && actor.getFlag("arcane-advent", "groundTemplate") === true;
export const isGroundDeposit = actor => actor?.type === "storage" && actor.system.ground && !isGroundTemplate(actor);
export const isSceneInventoryCopy = item => item?.type === "storage"
    && (item.system?.ground === true || item.getFlag?.("arcane-advent", "sceneInventoryInstance") === true);
export function looseGroundItem(actor) {
    if (!isGroundDeposit(actor)) return null;
    const items = [...actor.items];
    return items.length === 1 && isInventoryItem(items[0]) && !isInventoryContainer(items[0]) ? items[0] : null;
}
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

// Reserve one square footprint per root, near the source and inside the scene.
// A selected container and all its descendants share the same footprint.
function groundPositions(token, roots) {
    const scene = token.parent, grid = scene.grid.size;
    const occupied = [...scene.tokens].map(doc => ({ x: doc.x, y: doc.y, width: doc.width * grid, height: doc.height * grid }));
    return roots.map(root => {
        const side = groundTokenSize(groundItemAppearance(root).size), extent = side * grid;
        if (extent > scene.width || extent > scene.height) throw new Error("La taille du jeton dépasse celle de la scène.");
        const baseX = Math.round(Math.max(0, Math.min(scene.width - extent, token.x + token.width * grid)) / grid);
        const baseY = Math.round(Math.max(0, Math.min(scene.height - extent, token.y)) / grid);
        const available = (cx, cy) => {
            const x = cx * grid, y = cy * grid;
            return x >= 0 && y >= 0 && x + extent <= scene.width && y + extent <= scene.height
                && !occupied.some(rect => x < rect.x + rect.width && x + extent > rect.x && y < rect.y + rect.height && y + extent > rect.y);
        };
        const max = Math.ceil(Math.max(scene.width, scene.height) / grid) + 1;
        for (let radius = 0; radius <= max; radius++) {
            for (let dx = -radius; dx <= radius; dx++) for (const dy of radius ? [-radius, radius] : [0]) {
                if (available(baseX + dx, baseY + dy)) {
                    const position = { x: (baseX + dx) * grid, y: (baseY + dy) * grid, size: side, depth: groundItemAppearance(root).depth };
                    occupied.push({ ...position, width: extent, height: extent });
                    return position;
                }
            }
            for (let dy = -radius + 1; dy < radius; dy++) for (const dx of [-radius, radius]) {
                if (available(baseX + dx, baseY + dy)) {
                    const position = { x: (baseX + dx) * grid, y: (baseY + dy) * grid, size: side, depth: groundItemAppearance(root).depth };
                    occupied.push({ ...position, width: extent, height: extent });
                    return position;
                }
            }
        }
        throw new Error("Il n’y a pas assez de place près du personnage pour déposer ces objets.");
    });
}

export async function createStorage({ name = "Objets au sol", scene = null, x, y, ground = false, img, snap = true, size = 1.5, depth = size } = {}) {
    if (!game.user.isGM) throw new Error("La création d’un stockage nécessite le MJ.");
    size = groundTokenSize(size);
    if (!Number.isFinite(depth) || depth < 0) throw Error("Profondeur sur scène invalide.");
    img ||= game.settings.get("arcane-advent", "storageImage") || STORAGE_IMAGE;
    if (ground && !scene) throw new Error("Choisissez une scène pour le dépôt au sol.");
    const document = await Item.create({ name, type: "storage", img,
        ...(ground ? { flags: { "arcane-advent": { sceneInventoryInstance: true } } } : {}),
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        system: { ground, locked: false, contents: [], groundTokenSize: size, groundTokenDepth: depth } });
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
    const depth = itemStorage ? actor.system.groundTokenDepth ?? width : model.prototypeToken?.depth ?? width;
    const token = await model.getTokenDocument({ x, y, width, height, depth, ...(itemStorage ? {
        name: actor.name, actorLink: false, texture: { src: actor.img },
        flags: { "arcane-advent": { storageItemId: actor.id } }, delta: { name: actor.name, img: actor.img }
    } : {}) }, { parent: scene });
    const created = await scene.createEmbeddedDocuments("Token", [token.toObject()]);
    if (!created.length) throw new Error("Le jeton de stockage n’a pas pu être créé.");
    return created;
}

async function deleteEmptyGround(actor, force = false) {
    if ((!force && !isGroundDeposit(actor)) || actor.type !== "storage" || actor.items.size !== 0) return false;
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
    if (data.action === "shot") {
        const token = await fromUuid(data.sourceToken);
        requireSceneToken(token, source, user);
        return animateWeaponShot(source, source.items.get(data.selections?.[0]?.id), token, data.points);
    }
    if (data.action === "transfer" && data.selections?.length === 1) {
        const pile = source.items.get(data.selections[0].id);
        if (pile?.type === "purse" && pile.system.coinPile) {
            if (data.selections[0].quantity != null && data.selections[0].quantity !== 1) throw Error("Sélection de Luqa invalide.");
            data = { ...data, action: "coinAll", purseId: pile.id };
        }
    }
    const coinAction = ["coinAll", "coinPart", "coinDrop", "coinSplit"].includes(data.action);
    const dropping = ["drop", "throw", "split", "coinDrop", "coinSplit"].includes(data.action);
    const receiving = ["transfer", "equip", "takeStorage", "transferContents", "coinAll", "coinPart"].includes(data.action);
    if (!dropping && !receiving && data.action !== "merge") throw new Error("Action inconnue.");
    let selections = data.selections, destination, receiver, result;
    const created = [], locked = [];
    const lock = async inventory => {
        if (locked.includes(inventory)) return;
        if (inventory.getFlag("arcane-advent", "inventoryBusy")) throw new Error("Cet inventaire est déjà utilisé. Le MJ peut débloquer une opération interrompue depuis Stockages.");
        await inventory.setFlag("arcane-advent", "inventoryBusy", data.requestId);
        locked.push(inventory);
    };
    try {
        await lock(source);
        if (receiving) {
            const token = receiver = await fromUuid(data.targetToken);
            destination = inventoryForToken(token);
            if (!inventoryActor(destination) || destination.pack) throw new Error("Ciblez un personnage ou un stockage.");
            requireSceneToken(token, destination, user);
            if (source.uuid === destination.uuid) throw new Error("Choisissez un autre destinataire.");
            if (destination.type === "storage" && !storageAccess(destination, user)) throw new Error("Ce stockage est verrouillé ou inaccessible.");
            const looseTarget = destination.type === "storage" ? looseGroundItem(destination) : null;
            if (looseTarget && !(coinAction && looseTarget.type === "purse")) throw new Error("Choisissez un personnage, un contenant ou un stockage destinataire.");
            await lock(destination);
        }
        const main = source.type === "storage" ? mainGroundContainer(source) : null;
        if (["takeStorage", "transferContents"].includes(data.action)) {
            if (source.type !== "storage") throw new Error("Choisissez un stockage.");
            if (data.action === "takeStorage") {
                if (source.system.fixedOnScene || main?.system.fixedOnScene) throw new Error("Ce contenant est fixe sur scène.");
                selections = main ? [{ id: main.id, quantity: 1 }] : [];
            } else selections = storageContentItems(source).map(item => ({ id: item.id, quantity: item.type === "object" ? item.system.quantity : 1 }));
        }
        let plan;
        if (data.action === "merge") { plan = mergeStackPlan(source.items, data.mergeItemId); destination = null; }
        else if (coinAction) plan = coinPlan(source, destination, data.purseId, data.coins, {
            all: data.action === "coinAll", drop: ["coinDrop", "coinSplit"].includes(data.action), split: data.action === "coinSplit", randomID: foundry.utils.randomID
        });
        else if (data.action === "takeStorage" && !main) plan = packStoragePlan(source, foundry.utils.randomID);
        else {
            if (!Array.isArray(selections) || !selections.length || selections.length > 1000) throw new Error("Sélectionnez au moins un objet.");
            if (dropping) for (const selection of selections) {
                const size = source.items.get(selection.id)?.system.groundTokenSize;
                if (size != null) groundTokenSize(size);
            }
            if (main && (main.system.fixedOnScene || source.system.fixedOnScene) && selections.some(entry => entry.id === main.id)) throw new Error("Ce contenant est fixe sur scène.");
            if (data.action === "split") {
                const item = looseGroundItem(source), amount = selections[0]?.quantity;
                if (!item || item.type !== "object" || selections.length !== 1 || selections[0].id !== item.id
                    || !Number.isSafeInteger(amount) || amount < 1 || amount >= item.system.quantity) throw new Error("Scission de pile invalide.");
            }
            if (data.action === "equip") {
                if (destination.type === "storage" || selections.length !== 1 || !EQUIPMENT_TYPES.includes(source.items.get(selections[0].id)?.type)) {
                    throw new Error("Choisissez un seul équipement et un personnage destinataire.");
                }
            }
            plan = transferPlan(source.items, selections, foundry.utils.randomID);
        }
        // Loose currency is content, never a purse that can be carried outside
        // another purse. Also normalize legacy mixed selections containing it.
        if (receiving && !coinAction) {
            const piles = plan.creates.filter(item => item.type === "purse" && item.system.coinPile);
            if (piles.length) {
                const purse = firstInventoryPurse(destination);
                if (!purse) throw Error("Le destinataire ne possède aucune bourse.");
                const coins = checkedCoins(purse.system.coins);
                for (const pile of piles) for (const [key, value] of Object.entries(checkedCoins(pile.system.coins))) {
                    coins[key] += value;
                    if (!Number.isSafeInteger(coins[key])) throw Error("Cette bourse contient trop de Luqa.");
                }
                plan.visuals = piles;
                plan.creates = plan.creates.filter(item => !piles.includes(item));
                plan.destinationOriginals = [purse.toObject()];
                plan.destinationUpdates = [{ _id: purse.id, "system.coins": coins }];
            }
        }
        if (dropping) {
            const token = await fromUuid(data.sourceToken);
            requireSceneToken(token, source, user);
            const roots = plan.creates.filter(item => !item.system.containerId);
            const thrown = data.action === "throw", center = objectCenter(token);
            const single = roots.length === 1 ? roots[0] : null;
            const side = groundTokenSize(single ? groundItemAppearance(single).size : 1), extent = side * token.parent.grid.size;
            if (thrown) {
                const weapon = source.items.get(selections[0]?.id);
                if (selections.length !== 1 || weapon?.type !== "weapon" || weapon.system.corporeal || !weapon.system.equipped
                    || !new Set(weapon.system.properties).has("thrown")) throw new Error("Choisissez une arme Lancer équipée et non corporelle.");
                if (center.x - extent / 2 < 0 || center.y - extent / 2 < 0 || center.x + extent / 2 > token.parent.width || center.y + extent / 2 > token.parent.height) {
                    throw new Error("Le jeton de l’objet lancé doit tenir dans la scène à son point de départ.");
                }
                objectMotionPlan({ documentName: "Token", parent: token.parent, x: center.x - extent / 2, y: center.y - extent / 2,
                    width: side, height: side, rotation: 0 }, data.points, data.motion, { imageOffset: weapon.system.imageAngleOffset ?? 0 });
            }
            const positions = thrown ? [{ x: center.x - extent / 2, y: center.y - extent / 2, size: side, depth: single ? groundItemAppearance(single).depth : side }] : groundPositions(token, roots);
            for (const [index, root] of roots.entries()) {
                const storage = await createStorage({ name: root.name, img: groundItemAppearance(root).img,
                    scene: token.parent, ...positions[index], ground: true, snap: !thrown });
                created.push(storage);
                await lock(storage);
            }
            destination = created;
        }
        let transferAnimation;
        if (receiving) {
            const removeSource = data.action !== "transferContents"
                && (data.deleteEmptyGround === true || coinAction || data.action === "takeStorage");
            try { transferAnimation = await animateInventoryTransfer(source, receiver, plan, { removeSource }); }
            catch (error) { console.warn("Arcane Advent | Animation du transfert indisponible", error); }
        }
        const targetContainer = !Array.isArray(destination) && destination?.type === "storage" ? mainGroundContainer(destination) : null;
        if (targetContainer) for (const copy of plan.creates) if (!copy.system.containerId) copy.system.containerId = targetContainer.id;
        try { result = await executeInventoryPlan(source, destination, plan); }
        catch (error) {
            try { await transferAnimation?.rollback(); }
            catch (restoreError) { console.error("Arcane Advent | Restauration du jeton transféré", restoreError); }
            throw error;
        }
        if (data.action === "throw") {
            const token = [...game.scenes].flatMap(scene => [...scene.tokens]).find(token => inventoryForToken(token)?.uuid === created[0].uuid);
            try { if (!token) throw Error("Jeton du dépôt introuvable."); await animateSceneObject(token, data.points, data.motion); }
            catch (error) { result.warning = `L’arme est déposée au sol, mais son animation a échoué : ${error.message}`; }
        }
    } finally {
        for (const inventory of locked) await inventory.unsetFlag("arcane-advent", "inventoryBusy");
        for (const storage of created) if (storage.items.size === 0) await deleteEmptyGround(storage);
    }
    if (data.action === "equip") {
        try {
            const item = await destination.updateInventoryItem(result.createdIds[0], { "system.equipped": true });
            if (!item?.system.equipped) throw new Error("L’équipement ne peut pas être équipé actuellement.");
            result.equipped = true;
        } catch (error) { result.warning = `L’objet a été transféré, mais n’a pas pu être équipé : ${error.message}`; }
    }
    if (data.action !== "transferContents" && (data.deleteEmptyGround === true || coinAction || data.action === "takeStorage") && source.items.size === 0) {
        try { result.deletedGround = await deleteEmptyGround(source, data.action === "takeStorage"); }
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

export async function requestInventoryAction(actor, selections, { action, sourceToken, targetToken, deleteEmptyGround = false, points, motion, purseId, coins, mergeItemId }) {
    const gm = game.users.activeGM;
    if (!gm) throw new Error("Un MJ doit être connecté pour déplacer les objets.");
    const data = { requestId: foundry.utils.randomID(), source: actor.uuid,
        selections, action, sourceToken, targetToken, deleteEmptyGround: deleteEmptyGround === true, points, motion, purseId, coins, mergeItemId };
    const result = gm.isSelf
        ? await CONFIG.queries[STORAGE_QUERY](data, { user: game.user })
        : await gm.query(STORAGE_QUERY, data, { timeout: 30000 });
    if (result?.error) throw new Error(result.error);
    if (!result?.count) throw new Error("Réponse du MJ interrompue. Vérifiez les inventaires avant de réessayer.");
    return result;
}

export async function syncCoinPileAppearance(storage) {
    const loose = looseGroundItem(storage), main = mainGroundContainer(storage);
    const item = loose ?? main;
    const appearance = item ? groundItemAppearance(item) : groundItemAppearance({ type: "storage", system: storage.system });
    const { size, depth } = appearance, img = loose ? appearance.img : storage.img, name = loose ? item.name : storage.name;
    if (storage.name !== name || storage.img !== img || storage.system.groundTokenSize !== size || storage.system.groundTokenDepth !== depth)
        await storage.update({ name, img, "system.groundTokenSize": size, "system.groundTokenDepth": depth });
    for (const scene of game.scenes) {
        const changes = scene.tokens.filter(token => inventoryForToken(token)?.uuid === storage.uuid
            && (token.name !== name || token.texture?.src !== img || token.width !== size || token.height !== size || token.depth !== depth)).map(token => ({
            _id: token.id, name, "texture.src": img, width: size, height: size, depth,
            x: Math.max(0, Math.min(token.x, scene.width - size * scene.grid.size)),
            y: Math.max(0, Math.min(token.y, scene.height - size * scene.grid.size))
        }));
        if (changes.length) await scene.updateEmbeddedDocuments("Token", changes);
    }
}

export function registerCoinPileAppearance() {
    const queues = new Map();
    Hooks.on("updateItem", (item, changes) => {
        if (!game.users.activeGM?.isSelf || item.type !== "storage"
            || !["contents", "groundTokenSize", "groundTokenDepth"].some(key => Object.hasOwn(changes.system ?? {}, key) || Object.hasOwn(changes, "system." + key))) return;
        const next = (queues.get(item.uuid) ?? Promise.resolve()).catch(() => {}).then(() => syncCoinPileAppearance(inventoryForDocument(item)));
        queues.set(item.uuid, next);
        next.catch(error => ui.notifications.error(error.message)).finally(() => { if (queues.get(item.uuid) === next) queues.delete(item.uuid); });
    });
}
