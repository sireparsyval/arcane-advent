import { buildInventory, EQUIPMENT_TYPES, isInventoryContainer, LUQA_DENOMINATIONS } from "./inventory.mjs";
import { weaponAttackIcon } from "./combat-shortcuts.mjs";

export const GROUND_IMAGES = "assets/arcane-advent/entities/objects/";
export function inventorySelectionRows(items) {
    const rows = [];
    const append = (item, depth, weight) => rows.push({ item, depth, weight,
        icon: item.type === "weapon" ? weaponAttackIcon(item) : ({ shield: "🛡️", protection: "🪖", accessory: "🎀", purse: "💰", container: "📦" }[item.type] ?? "") });
    for (const item of [...items].filter(item => item.system.equipped).sort((a,b) => (a.sort ?? 0) - (b.sort ?? 0))) append(item, 0,
        item.type === "weapon" && item.system.corporeal ? 0 : item.system.weight ?? 0);
    const visit = (nodes, depth = 0) => { for (const node of nodes) { append(node.item, depth, node.item.type === "object" ? node.weight * node.item.system.quantity : node.weight); visit(node.children, depth + 1); } };
    visit(buildInventory(items).roots);
    return rows;
}
export function checkedCoins(coins = {}) {
    if (!coins || typeof coins !== "object" || Array.isArray(coins)
        || Object.keys(coins).some(key => !LUQA_DENOMINATIONS.some(entry => entry.key === key))) throw Error("Sélection de Luqa invalide.");
    return Object.fromEntries(LUQA_DENOMINATIONS.map(({ key }) => {
        const value = coins[key] ?? 0;
        if (!Number.isSafeInteger(value) || value < 0) throw Error("Quantité de Luqa invalide.");
        return [key, value];
    }));
}
export const hasCoins = coins => Object.values(coins ?? {}).some(value => value > 0);

export function groundItemAppearance(item) {
    const system = item.system ?? {};
    if (item.type === "purse" && system.coinPile) {
        const coins = checkedCoins(system.coins), kinds = Object.entries(coins).filter(([, count]) => count > 0);
        if (kinds.length === 1) {
            const [key, count] = kinds[0];
            return { img: `${GROUND_IMAGES}${count === 1 ? "coin" : "stack"}-luqa-${key}.png`, size: count === 1 ? 0.25 : 0.5 };
        }
        return { img: `${GROUND_IMAGES}stack-luqa.png`, size: 0.75 };
    }
    const defaults = item.type === "container" || item.type === "storage" ? ["bag-item.png", 1.5]
        : item.type === "purse" ? ["bag-luqa.png", 1] : ["item-generic.png", 1.25];
    return { img: system.groundTokenImage?.trim() || GROUND_IMAGES + defaults[0], size: system.groundTokenSize ?? defaults[1] };
}

export function mainGroundContainer(source) {
    if (!source.system.ground) return null;
    const roots = [...source.items].filter(item => !item.system.containerId);
    return roots.length === 1 && isInventoryContainer(roots[0]) ? roots[0] : null;
}
export function storageContentItems(source) {
    const main = mainGroundContainer(source);
    return [...source.items].filter(item => item.id !== main?.id);
}
export function firstInventoryPurse(source) {
    const visit = nodes => {
        for (const node of nodes) {
            if (node.item.type === "purse") return node.item;
            const child = visit(node.children);
            if (child) return child;
        }
        return null;
    };
    return visit(buildInventory(source.items).roots);
}
export function groundMenu(source) {
    const items = [...source.items], main = mainGroundContainer(source);
    const loose = source.system.ground && items.length === 1 && !main ? items[0] : null;
    if (loose?.type === "purse") return { kind: "purse", item: loose, actions: [
        ["take", "Transférer tout", "fa-right-left"], ["coinsAll", "Transférer le contenu", "fa-coins"],
        ["coinsPart", "Transférer une partie", "fa-list-check"], ["coinsDrop", "Déposer des Luqa", "fa-arrow-down-to-line"]
    ] };
    if (loose && loose.type !== "container") {
        const stack = loose.type === "object" && loose.system.quantity > 1;
        return { kind: "item", item: loose, actions: [
            ...(EQUIPMENT_TYPES.includes(loose.type) ? [["equip", "Équiper", "fa-hand"]] : []),
            ["take", stack ? "Tout transférer" : "Transférer", "fa-right-left"],
            ...(stack ? [["takePart", "Transférer une partie", "fa-list-check"], ["split", "Scinder", "fa-scissors"]] : [])
        ] };
    }
    return { kind: "storage", item: main, actions: [
        ...(!source.system.fixedOnScene && !main?.system.fixedOnScene ? [["takeStorage", "Tout transférer", "fa-right-left"]] : []),
        ["contents", "Transférer le contenu", "fa-box-open"], ["selection", "Transférer une partie", "fa-list-check"],
        ["dropSelection", "Déposer", "fa-arrow-down-to-line"]
    ] };
}
