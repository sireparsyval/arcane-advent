import { canPlaceInContainer, EQUIPMENT_TYPES, isInventoryContainer, isInventoryItem } from "../inventory.mjs";

export function getEquipmentConflictType(type, properties) {
    if (type === "shield") return "weapon";
    if (type === "weapon" && hasTwoHandedProperty(properties)) return "shield";
    return null;
}

function hasTwoHandedProperty(properties) {
    return properties instanceof Set ? properties.has("twoHanded") : properties?.includes("twoHanded");
}

function projectInventoryItem(item, changes = {}) {
    const system = {};
    for (const field of ["containerId", "equipped", "properties"]) {
        system[field] = Object.hasOwn(changes, field) ? changes[field] : item.system[field];
    }
    return { id: item.id, type: item.type, system };
}

export class ArcaneItem extends Item {

    async _preUpdate(changes, operation, user) {
        if (await super._preUpdate(changes, operation, user) === false) return false;
        if (!EQUIPMENT_TYPES.includes(this.type) || !changes.system) return;
        const system = changes.system;

        if (system.containerId) system.equipped = false;
        else if (system.equipped === true) system.containerId = null;

        if (this.type === "weapon" && (Object.hasOwn(system, "properties") || system.guardEnabled)) {
            const properties = system.properties ?? this.system.properties;
            if (!hasTwoHandedProperty(properties)) system.guardEnabled = false;
        }
    }

    static async _preUpdateOperation(documents, operation, user) {
        if (await super._preUpdateOperation(documents, operation, user) === false) return false;
        if (!documents.some(isInventoryItem)) return;
        const changes = new Map(operation.updates.map(update => [update._id, update]));
        const actor = operation.parent ?? documents[0]?.actor;
        const inventory = actor?.type === "character" ? actor.items : documents;
        const projected = new Map();

        for (const item of inventory) {
            if (isInventoryItem(item)) projected.set(item.id, projectInventoryItem(item, changes.get(item.id)?.system));
        }

        for (const [id, update] of changes) {
            const item = projected.get(id);
            if (!item || !Object.hasOwn(update.system ?? {}, "containerId")) continue;
            const destination = item.system.containerId;
            if (destination && (actor?.type !== "character"
                || !canPlaceInContainer(projected, id, destination))) {
                ui.notifications.warn("Ce déplacement créerait un cycle ou viserait un contenant invalide.");
                return false;
            }
        }

        if (actor?.type !== "character") return;
        const changedLoadout = [...changes].some(([id, update]) => {
            const item = projected.get(id);
            return item?.system.equipped && getEquipmentConflictType(item.type, item.system.properties)
                && (Object.hasOwn(update.system ?? {}, "equipped") || Object.hasOwn(update.system ?? {}, "properties"));
        });
        if (!changedLoadout) return;

        const equipped = [...projected.values()].filter(item => item.system.equipped);
        if (equipped.some(item => item.type === "shield")
            && equipped.some(item => getEquipmentConflictType(item.type, item.system.properties) === "shield")) {
            ui.notifications.warn("Un bouclier et une arme à deux mains ne peuvent pas être équipés ensemble.");
            return false;
        }
    }

    static async _preCreateOperation(documents, operation, user) {
        if (await super._preCreateOperation(documents, operation, user) === false) return false;
        const pending = documents.filter(isInventoryItem);
        if (!pending.length) return;
        const actor = operation.parent ?? documents[0]?.actor;
        const embedded = actor?.type === "character" ? [...actor.items] : [];
        const existing = new Set(embedded.map(item => item.id));
        const inventory = operation.keepId
            ? [...embedded, ...pending.filter(item => item.id && !existing.has(item.id))]
            : embedded;
        const blockedTypes = new Set(embedded
            .filter(item => item.system.equipped)
            .map(item => getEquipmentConflictType(item.type, item.system.properties))
            .filter(Boolean));

        for (const item of pending) {
            const { containerId, properties } = item.system;
            const changes = {};
            if (containerId && (actor?.type !== "character"
                || !canPlaceInContainer(inventory, item.id, containerId))) {
                // Copies may still reference a container in their source Actor.
                changes["system.containerId"] = null;
            }
            if (EQUIPMENT_TYPES.includes(item.type) && item.system.equipped) {
                const conflictType = getEquipmentConflictType(item.type, properties);
                if ((containerId && !Object.hasOwn(changes, "system.containerId"))
                    || (actor?.type === "character" && conflictType && blockedTypes.has(item.type))) {
                    changes["system.equipped"] = false;
                } else if (conflictType) {
                    blockedTypes.add(conflictType);
                }
            }
            if (Object.keys(changes).length) item.updateSource(changes);
        }
    }

    static async _preDeleteOperation(documents, operation, user) {
        if (await super._preDeleteOperation(documents, operation, user) === false) return false;
        const actor = operation.parent ?? documents[0]?.actor;
        if (actor?.type === "character") {
            const deletedIds = new Set(documents.map(item => item.id));
            const linkedAptitudes = actor.items.filter(item => item.type === "aptitude"
                && item.system.traitId && actor.items.get(item.system.traitId)?.type === "trait");

            // Une aptitude issue d'un Trait ne se supprime que depuis les options de celui-ci,
            // ou en même temps que son Trait.
            for (const aptitude of linkedAptitudes) {
                if (!deletedIds.has(aptitude.id)) continue;
                if (deletedIds.has(aptitude.system.traitId)
                    || operation.arcaneTraitAptitudeId === aptitude.system.traitId) continue;
                ui.notifications.warn("Cette aptitude est liée à un Trait : supprimez-la depuis les options de ce Trait.");
                return false;
            }

            // Ne jamais laisser des Aptitudes orphelines quand un Trait est effacé ailleurs
            // que dans la fiche : la fiche propose d'abord de les conserver ou de les supprimer.
            for (const item of documents) {
                if (item.type !== "trait") continue;
                if (linkedAptitudes.some(apt => apt.system.traitId === item.id && !deletedIds.has(apt.id))) {
                    ui.notifications.warn("Ce Trait possède des Aptitudes liées. Utilisez sa suppression dans la fiche pour choisir leur sort.");
                    return false;
                }
            }
        }
        if (actor?.type !== "character" || !documents.some(item => isInventoryContainer(item) || item.type === "purse")) return;

        const deleted = new Set(documents.map(item => item.id));
        const remaining = new Map();
        for (const item of actor.items) {
            if (!deleted.has(item.id) && isInventoryItem(item)) {
                remaining.set(item.id, projectInventoryItem(item));
            }
        }

        const updates = [];
        for (const item of remaining.values()) {
            let destination = item.system.containerId;
            if (!deleted.has(destination)) continue;

            // Skip all deleted ancestors when several nested containers are removed together.
            const seen = new Set();
            while (deleted.has(destination) && !seen.has(destination)) {
                seen.add(destination);
                destination = actor.items.get(destination)?.system.containerId ?? null;
            }
            item.system.containerId = destination;
            updates.push({ _id: item.id, "system.containerId": destination });
        }
        if (!updates.length) return;

        for (const update of updates) {
            const item = remaining.get(update._id);
            if (!canPlaceInContainer(remaining, item.id, item.system.containerId)) {
                item.system.containerId = null;
                update["system.containerId"] = null;
            }
        }

        const moved = await actor.updateEmbeddedDocuments("Item", updates, { render: false });
        if (moved.length !== updates.length) return false;
    }
}
