import { EQUIPMENT_TYPES, isInventoryContainer, isInventoryItem } from "./inventory.mjs";
import { inventorySource } from "./inventory-source.mjs";

// Build a fresh identity map for the whole subtree before creating any document.
export function transferPlan(items, selections, randomID) {
    const byId = new Map(Array.from(items, item => [item.id, item]));
    if (!Array.isArray(selections) || !selections.length) throw new Error("Sélectionnez au moins un objet.");
    const selected = new Map();
    for (const { id, quantity } of selections) {
        const item = byId.get(id);
        if (item?.type === "weapon" && item.system.corporeal) throw Error("Déverrouillez l’arme corporelle avant de la déplacer.");
        if (!isInventoryItem(item) || selected.has(id)) throw new Error("Sélection d’objets invalide.");
        const count = item.type === "object" ? item.system.quantity : 1;
        const amount = quantity ?? count;
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > count) {
            throw new Error("La quantité demandée n’est plus disponible.");
        }
        selected.set(id, amount);
    }
    const included = new Set(selected.keys());
    let changed = true;
    while (changed) {
        changed = false;
        for (const item of byId.values()) {
            if (isInventoryItem(item) && !included.has(item.id)
                && included.has(item.system.containerId)
                && isInventoryContainer(byId.get(item.system.containerId))) {
                included.add(item.id);
                changed = true;
            }
        }
    }
    const ids = new Map([...included].map(id => [id, randomID()]));
    const creates = [], deletes = [], updates = [], originals = [];
    for (const id of included) {
        const item = byId.get(id);
        const data = inventorySource(item.toObject());
        originals.push(data);
        const parentIncluded = included.has(item.system.containerId)
            && isInventoryContainer(byId.get(item.system.containerId));
        // Selecting a parent always moves all of its contents, even if a child
        // was also individually checked with a smaller quantity.
        const quantity = parentIncluded ? item.system.quantity : selected.get(id) ?? item.system.quantity;
        const copy = inventorySource(data);
        copy._id = ids.get(id);
        copy.system.containerId = parentIncluded ? ids.get(item.system.containerId) : null;
        if (EQUIPMENT_TYPES.includes(item.type)) copy.system.equipped = false;
        if (item.type === "object") copy.system.quantity = quantity;
        creates.push(copy);
        if (item.type === "object" && quantity < item.system.quantity) {
            updates.push({ _id: id, "system.quantity": item.system.quantity - quantity });
        } else deletes.push(id);
    }
    // Corrupt cycles must not be copied to the recipient.
    for (const data of creates) {
        const seen = new Set([data._id]);
        let parent = data.system.containerId;
        while (parent) {
            if (seen.has(parent)) throw new Error("Le contenant contient une référence circulaire.");
            seen.add(parent);
            parent = creates.find(item => item._id === parent)?.system.containerId;
        }
    }
    return { creates, deletes, updates, originals };
}

// Both sides are locked by the caller. A failed write is compensated from
// snapshots; source items are removed only after every destination item exists.
export async function executeTransfer(source, destination, selections, randomID) {
    const destinations = Array.isArray(destination) ? destination : [destination];
    if (destinations.some(entry => source.uuid === entry.uuid)) throw new Error("Choisissez un autre destinataire.");
    if (new Set(destinations.map(entry => entry.uuid)).size !== destinations.length) throw new Error("Destinations de dépôt invalides.");
    const plan = transferPlan(source.items, selections, randomID);
    const roots = plan.creates.filter(item => !item.system.containerId);
    if (Array.isArray(destination) && roots.length !== destinations.length) throw new Error("Dépôts au sol incomplets.");
    const copies = new Map(plan.creates.map(item => [item._id, item]));
    const rootFor = item => {
        while (item.system.containerId) item = copies.get(item.system.containerId);
        return item._id;
    };
    const groups = destinations.map((entry, index) => ({ destination: entry,
        creates: Array.isArray(destination) ? plan.creates.filter(item => rootFor(item) === roots[index]._id) : plan.creates }));
    // Foundry mutates operations (parentUuid, data, updates, ids). Reusing one
    // can redirect a world storage Item write into the recipient Actor.
    const options = () => ({ keepId: true, aaTransfer: true });
    try {
        for (const { destination, creates } of groups) {
            const created = await destination.createEmbeddedDocuments("Item", creates, options());
            if (created.length !== creates.length || creates.some(item => !destination.items.get(item._id))) {
                throw new Error("Le stockage destinataire n’a pas accepté tous les objets.");
            }
        }
        if (plan.updates.length) {
            const updated = await source.updateEmbeddedDocuments("Item", plan.updates, options());
            if (updated.length !== plan.updates.length) throw new Error("Quantités non mises à jour.");
        }
        if (plan.deletes.length) {
            await source.deleteEmbeddedDocuments("Item", plan.deletes, options());
            if (plan.deletes.some(id => source.items.get(id))) throw new Error("Le déplacement a été interrompu.");
        }
        return { count: plan.creates.length };
    } catch (error) {
        try {
            const missing = plan.originals.filter(item => !source.items.get(item._id));
            if (missing.length) await source.createEmbeddedDocuments("Item", missing, options());
            const existing = plan.originals.filter(item => source.items.get(item._id));
            if (existing.length) await source.updateEmbeddedDocuments("Item", existing, options());
            if (plan.originals.some(item => !source.items.get(item._id))) throw new Error("Restauration incomplète.");
            for (const { destination, creates } of groups) {
                const ids = creates.map(item => item._id);
                const remaining = ids.filter(id => destination.items.get(id));
                if (remaining.length) await destination.deleteEmbeddedDocuments("Item", remaining, options());
                if (ids.some(id => destination.items.get(id))) throw new Error("Annulation incomplète.");
            }
        } catch (rollbackError) {
            console.error("Arcane Advent | Réconciliation nécessaire", { source: source.uuid,
                destinations: destinations.map(entry => entry.uuid), plan, error, rollbackError });
            throw new Error("Transfert interrompu : le MJ doit vérifier les deux inventaires (détails dans la console).");
        }
        throw error;
    }
}
