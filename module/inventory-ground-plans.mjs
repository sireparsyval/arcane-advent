import { inventorySource } from "./inventory-source.mjs";
import { transferPlan } from "./inventory-transfer.mjs";
import { checkedCoins, firstInventoryPurse, hasCoins } from "./ground-items.mjs";

export function coinPlan(source, destination, purseId, selected, { all = false, drop = false, split = false, randomID } = {}) {
    const purse = source.items.get(purseId);
    if (purse?.type !== "purse") throw Error("Choisissez une bourse ou des pièces de Luqa.");
    const available = checkedCoins(purse.system.coins), coins = all ? available : checkedCoins(selected);
    if (!hasCoins(coins)) throw Error("Sélectionnez au moins une pièce.");
    for (const key of Object.keys(coins)) if (coins[key] > available[key]) throw Error("Ces Luqa ne sont plus disponibles.");
    const target = drop ? null : firstInventoryPurse(destination);
    if (!drop && !target) {
        if (!all || purse.system.coinPile) throw Error("Le destinataire ne possède aucune bourse.");
        return transferPlan(source.items, [{ id: purseId, quantity: 1 }], randomID);
    }
    const remainder = Object.fromEntries(Object.keys(coins).map(key => [key, available[key] - coins[key]]));
    if (split && !hasCoins(remainder)) throw Error("Conservez au moins une pièce dans le tas initial.");
    const plan = { creates: [], deletes: [], updates: [], originals: [inventorySource(purse.toObject())], destinationUpdates: [], destinationOriginals: [],
        visuals: [{ type: "purse", name: "Pièces de Luqa", system: { coinPile: true, coins, imageAngleOffset: purse.system.imageAngleOffset ?? 0 } }] };
    if (purse.system.coinPile && !hasCoins(remainder)) plan.deletes.push(purseId);
    else plan.updates.push({ _id: purseId, "system.coins": remainder });
    if (drop) {
        const copy = inventorySource(purse.toObject());
        copy._id = randomID(); copy.name = "Pièces de Luqa";
        Object.assign(copy.system, { containerId: null, coins, coinPile: true, groundTokenImage: "" });
        plan.creates.push(copy);
    } else {
        const previous = checkedCoins(target.system.coins);
        const received = Object.fromEntries(Object.keys(coins).map(key => {
            const amount = previous[key] + coins[key];
            if (!Number.isSafeInteger(amount)) throw Error("Cette bourse contient trop de Luqa.");
            return [key, amount];
        }));
        plan.destinationOriginals.push(inventorySource(target.toObject()));
        plan.destinationUpdates.push({ _id: target.id, "system.coins": received });
    }
    return plan;
}

export function packStoragePlan(source, randomID) {
    const originals = [...source.items].map(item => inventorySource(item.toObject()));
    const id = randomID(), ids = new Map(originals.map(item => [item._id, randomID()]));
    return { creates: [{ _id: id, type: "container", name: source.name, img: source.img,
        system: { description: source.system.description ?? "", containerId: null, fixedOnScene: false,
            groundTokenImage: source.img, groundTokenSize: source.system.groundTokenSize ?? 1.5, imageAngleOffset: source.system.imageAngleOffset ?? 0 } },
        ...originals.map(item => ({ ...inventorySource(item), _id: ids.get(item._id), system: { ...inventorySource(item.system),
            containerId: ids.get(item.system.containerId) ?? id, ...(item.system.equipped ? { equipped: false } : {}) } }))],
        deletes: originals.map(item => item._id), updates: [], originals };
}
