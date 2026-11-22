import { inventorySource } from "./inventory-source.mjs";

const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
export function stackGroups(items) {
    const groups = new Map();
    for (const item of items) {
        if (item.type !== "object") continue;
        const source = inventorySource(item.toObject ? item.toObject() : item);
        for (const key of ["_id", "id", "sort", "folder", "ownership", "_stats"]) delete source[key];
        delete source.system.quantity;
        source.system.containerId ||= null;
        const key = JSON.stringify(ordered(source));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return [...groups.values()].filter(group => group.length > 1).map(group => group.sort((a,b) => (a.sort ?? 0) - (b.sort ?? 0)));
}
export function mergeStackPlan(items, id) {
    const group = stackGroups(items).find(group => group.some(item => item.id === id));
    if (!group) throw Error("Il n’y a plus de piles identiques à regrouper dans ce contenant.");
    const quantity = group.reduce((sum, item) => sum + item.system.quantity, 0);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw Error("Quantité totale invalide.");
    return { creates: [], updates: [{ _id: group[0].id, "system.quantity": quantity }],
        deletes: group.slice(1).map(item => item.id), originals: group.map(item => inventorySource(item.toObject())) };
}
