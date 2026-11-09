export const EQUIPMENT_TYPES = ["weapon", "shield", "protection", "accessory"];
const CONTAINER_TYPES = ["container", "purse"];
export const INVENTORY_TYPES = [...EQUIPMENT_TYPES, "object", ...CONTAINER_TYPES];

export const LUQA_DENOMINATIONS = [
    { key: "copper", symbol: "₤c", label: "Luqa de cuivre" },
    { key: "silver", symbol: "₤a", label: "Luqa d’argent" },
    { key: "gold", symbol: "₤o", label: "Luqa d’or" },
    { key: "platinum", symbol: "₤p", label: "Luqa de platine" }
];

export function isInventoryItem(item) {
    return INVENTORY_TYPES.includes(item?.type);
}

export function isInventoryContainer(item) {
    return CONTAINER_TYPES.includes(item?.type);
}

export function luqaCounters(item) {
    if (item.type !== "purse") return [];
    return LUQA_DENOMINATIONS.map(denomination => ({
        ...denomination,
        value: item.system.coins[denomination.key],
        field: `system.coins.${denomination.key}`
    }));
}

export function canPlaceInContainer(items, itemId, containerId) {
    if (containerId == null || containerId === "") return true;

    const byId = items instanceof Map ? items : new Map(Array.from(items, item => [item.id, item]));
    const ancestors = new Set([itemId]);
    for (let id = containerId; id != null && id !== ""; ) {
        const container = byId.get(id);
        if (ancestors.has(id) || !isInventoryContainer(container)) return false;
        ancestors.add(id);
        id = container.system.containerId;
    }
    return true;
}

function carriedWeight(item, weight) {
    return item.type === "object" ? weight * (item.system.quantity ?? 1) : weight;
}

export function buildInventory(items) {
    const nodes = new Map();
    let totalWeight = 0;
    for (const item of items) {
        if (!isInventoryItem(item)) continue;
        const weight = isInventoryContainer(item) ? 0 : (item.system.weight ?? 0);
        nodes.set(item.id, { item, children: [], weight });
        totalWeight += carriedWeight(item, weight);
    }

    const parents = new Map();
    for (const node of nodes.values()) {
        const parent = nodes.get(node.item.system.containerId);
        if (isInventoryContainer(parent?.item) && parent !== node && !node.item.system.equipped) {
            parents.set(node, parent);
        }
    }

    // Present corrupt or dangling references at the root without changing the source.
    const visited = new Set();
    for (const node of parents.keys()) {
        const path = new Set();
        for (let current = node; parents.has(current) && !visited.has(current); ) {
            path.add(current);
            const parent = parents.get(current);
            if (path.has(parent)) {
                parents.delete(current);
                break;
            }
            current = parent;
        }
        for (const member of path) visited.add(member);
    }

    const roots = [];
    for (const node of nodes.values()) {
        const parent = parents.get(node);
        if (parent) parent.children.push(node);
        else if (!node.item.system.equipped) roots.push(node);
    }

    // Visit children before accumulating into their parents, regardless of nesting depth.
    const ordered = [...roots];
    for (const node of ordered) {
        for (const child of node.children) ordered.push(child);
    }
    for (let index = ordered.length - 1; index >= 0; index--) {
        const node = ordered[index];
        const parent = parents.get(node);
        if (parent) parent.weight += carriedWeight(node.item, node.weight);
    }

    return { roots, totalWeight };
}
