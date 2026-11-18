import { canPlaceInContainer, EQUIPMENT_TYPES, isInventoryItem } from "./inventory.mjs";

const inventories = new WeakMap();
const contentOwners = new WeakMap();

class Contents extends Map {
    [Symbol.iterator]() { return this.values(); }
    filter(callback) { return [...this.values()].filter(callback); }
}

export const storageInventoryOwner = item => contentOwners.get(item);

// Storage Items own serialized Item sources. Temporary Item documents retain
// each equipment data model without pretending that Items embed other Items.
export class StorageInventory {
    #queue = Promise.resolve();
    #source;
    #items = new Contents();

    constructor(document) { this.document = document; }
    get id() { return this.document.id; }
    get uuid() { return this.document.uuid; }
    get type() { return "storage"; }
    get name() { return this.document.name; }
    get img() { return this.document.img; }
    get system() { return this.document.system; }
    get pack() { return this.document.pack; }
    get isOwner() { return this.document.isOwner; }
    get sheet() { return this.document.sheet; }
    get items() {
        if (this.#source !== this.system.contents) {
            const next = new Contents();
            for (const source of this.system.contents) {
                const item = this.#items.get(source._id) ?? new CONFIG.Item.documentClass(source, { strict: true });
                if (this.#items.has(source._id)) item.updateSource(source, { diff: false, recursive: false });
                contentOwners.set(item, this);
                next.set(item.id, item);
            }
            this.#items = next;
            this.#source = this.system.contents;
        }
        return this.#items;
    }
    getFlag(...args) { return this.document.getFlag(...args); }
    setFlag(...args) { return this.document.setFlag(...args); }
    unsetFlag(...args) { return this.document.unsetFlag(...args); }
    testUserPermission(...args) { return this.document.testUserPermission(...args); }
    update(...args) { return this.document.update(...args); }
    delete(...args) { return this.document.delete(...args); }

    #write(callback, options) {
        const operation = this.#queue.then(async () => {
            if (!this.isOwner) throw new Error("Vous ne pouvez pas modifier ce stockage.");
            if (this.getFlag("arcane-advent", "inventoryBusy") && !(options.aaTransfer && game.user.isGM)) {
                throw new Error("Un transfert est en cours sur cet inventaire.");
            }
            return callback();
        });
        this.#queue = operation.catch(() => {});
        return operation;
    }

    async #save(sources, options) {
        const projected = new Contents();
        for (const source of sources) {
            if (!isInventoryItem(source) || projected.has(source._id)) throw new Error("Contenu de stockage invalide.");
            source.system ??= {};
            if (EQUIPMENT_TYPES.includes(source.type)) source.system.equipped = false;
            const item = new CONFIG.Item.documentClass(source, { strict: true });
            item.validate({ strict: true });
            projected.set(item.id, item);
        }
        for (const item of projected) {
            if (!canPlaceInContainer(projected, item.id, item.system.containerId)) {
                throw new Error("Le contenant est invalide ou contient une référence circulaire.");
            }
        }
        const contents = [...projected].map(item => item.toObject());
        await this.document.update({ "system.contents": contents }, options);
        if (!foundry.utils.equals(this.system.contents, contents)) throw new Error("Le stockage n’a pas enregistré tous les changements.");
        this.#source = undefined;
    }

    createEmbeddedDocuments(type, sources, options = {}) {
        return this.#write(async () => {
            if (type !== "Item") throw new Error("Type de contenu invalide.");
            const created = sources.map(source => ({ ...structuredClone(source),
                _id: options.keepId && source._id ? source._id : foundry.utils.randomID() }));
            await this.#save([...this.items].map(item => item.toObject()).concat(created), options);
            return created.map(source => this.items.get(source._id));
        }, options);
    }

    updateEmbeddedDocuments(type, changes, options = {}) {
        return this.#write(async () => {
            if (type !== "Item") throw new Error("Type de contenu invalide.");
            const updates = new Map(changes.map(change => [change._id, change]));
            if ([...updates.keys()].some(id => !this.items.has(id))) throw new Error("Un objet n’est plus disponible.");
            const sources = [...this.items].map(item => {
                const copy = new CONFIG.Item.documentClass(item.toObject(), { strict: true });
                if (updates.has(item.id)) copy.updateSource(updates.get(item.id));
                return copy.toObject();
            });
            await this.#save(sources, options);
            return changes.map(change => this.items.get(change._id));
        }, options);
    }

    deleteEmbeddedDocuments(type, ids, options = {}) {
        return this.#write(async () => {
            if (type !== "Item") throw new Error("Type de contenu invalide.");
            const removed = new Set(ids);
            const before = this.items;
            const deleted = ids.map(id => before.get(id)).filter(Boolean);
            const sources = [...before].filter(item => !removed.has(item.id)).map(item => {
                const source = item.toObject();
                let parent = source.system.containerId;
                const visited = new Set();
                while (removed.has(parent) && !visited.has(parent)) {
                    visited.add(parent);
                    parent = before.get(parent)?.system.containerId ?? null;
                }
                source.system.containerId = parent;
                return source;
            });
            await this.#save(sources, options);
            return deleted;
        }, options);
    }

    async updateInventoryItem(id, changes) { return (await this.updateEmbeddedDocuments("Item", [{ ...changes, _id: id }]))[0]; }
    async moveInventoryItem(id, containerId) { return this.updateInventoryItem(id, { "system.containerId": containerId }); }
    async deleteInventoryItem(id) { return (await this.deleteEmbeddedDocuments("Item", [id])).length > 0; }
}

export function inventoryForDocument(document) {
    if (document?.documentName === "Item" && document.type === "storage") {
        if (!inventories.has(document)) inventories.set(document, new StorageInventory(document));
        return inventories.get(document);
    }
    if (document?.token?.getFlag?.("arcane-advent", "storageItemId")) return inventoryForToken(document.token);
    return document;
}

export function inventoryForToken(token) {
    const id = token?.getFlag?.("arcane-advent", "storageItemId");
    if (id) return inventoryForDocument(game.items.get(id)) ?? null;
    return token?.actor ?? null;
}
