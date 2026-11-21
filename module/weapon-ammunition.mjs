const queues = new WeakMap();
export function ammunitionItems(actor) {
    return [...(actor?.items ?? [])].filter(item => item.type === "object"
        && item.system.objectClass?.trim().toLocaleLowerCase("fr") === "munitions");
}

// Serialize attacks from this actor on this client, including attacks sharing a stack.
export function withWeaponAmmunition(actor, weaponId, roll) {
    const task = async () => {
        const weapon = actor.items.get(weaponId), ammo = weapon?.system.ammunition;
        if (!weapon || weapon.type !== "weapon") return;
        if (!weapon.system.properties.has("ammunition") || !ammo?.enabled) return roll();
        if (actor.isOwner === false) throw Error("Vous ne pouvez pas utiliser les munitions de ce personnage.");
        const item = ammunitionItems(actor).find(item => item.id === ammo.itemId), cost = ammo.quantity;
        if (!item || !Number.isSafeInteger(cost) || cost < 1 || !Number.isSafeInteger(item.system.quantity)
            || item.system.quantity < cost) throw Error("Munitions manquantes ou insuffisantes : choisissez un stock et une quantité dans l’arme.");
        const quantity = item.system.quantity, source = item.toObject();
        const empty = quantity === cost;
        if (empty) await actor.deleteEmbeddedDocuments("Item", [item.id]);
        else await item.update({ "system.quantity": quantity - cost });
        try {
            const result = await roll();
            if (!result) throw Error("Le jet d’attaque n’a pas été effectué.");
            return result;
        } catch (error) {
            if (empty) await actor.createEmbeddedDocuments("Item", [source], { keepId: true });
            else await item.update({ "system.quantity": quantity });
            throw error;
        }
    };
    const result = (queues.get(actor) ?? Promise.resolve()).catch(() => {}).then(task);
    queues.set(actor, result);
    result.finally(() => { if (queues.get(actor) === result) queues.delete(actor); }).catch(() => {});
    return result;
}
