import { EQUIPMENT_TYPES, isInventoryContainer, isInventoryItem } from "./inventory.mjs";

// Build a fresh identity map for the whole subtree before creating any document.
export function transferPlan(items, selections, randomID) {
    const byId = new Map(Array.from(items, item => [item.id, item]));
    if (!Array.isArray(selections) || !selections.length) throw new Error("Sélectionnez au moins un objet.");
    const selected = new Map();
    for (const { id, quantity } of selections) {
        const item = byId.get(id);
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
        const data = item.toObject();
        originals.push(data);
        const parentIncluded = included.has(item.system.containerId)
            && isInventoryContainer(byId.get(item.system.containerId));
        // Selecting a parent always moves all of its contents, even if a child
        // was also individually checked with a smaller quantity.
        const quantity = parentIncluded ? item.system.quantity : selected.get(id) ?? item.system.quantity;
        const copy = structuredClone(data);
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
    if (source.uuid === destination.uuid) throw new Error("Choisissez un autre destinataire.");
    const plan = transferPlan(source.items, selections, randomID);
    // Foundry mutates operations (parentUuid, data, updates, ids). Reusing one
    // can redirect a world storage Item write into the recipient Actor.
    const options = () => ({ keepId: true, aaTransfer: true });
    const ids = plan.creates.map(item => item._id);
    try {
        const created = await destination.createEmbeddedDocuments("Item", plan.creates, options());
        if (created.length !== ids.length || ids.some(id => !destination.items.get(id))) {
            throw new Error("Le stockage destinataire n’a pas accepté tous les objets.");
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
            const remaining = ids.filter(id => destination.items.get(id));
            if (remaining.length) await destination.deleteEmbeddedDocuments("Item", remaining, options());
            if (ids.some(id => destination.items.get(id))) throw new Error("Annulation incomplète.");
        } catch (rollbackError) {
            console.error("Arcane Advent | Réconciliation nécessaire", { source: source.uuid,
                destination: destination.uuid, plan, error, rollbackError });
            throw new Error("Transfert interrompu : le MJ doit vérifier les deux inventaires (détails dans la console).");
        }
        throw error;
    }
}
