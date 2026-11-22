import { formDialog } from "./form-interactions.mjs";
import { inventoryActor, looseGroundItem, requestInventoryAction, storageAccess } from "../storage.mjs";
import { inventoryForToken } from "../storage-inventory.mjs";
import { isInventoryItem } from "../inventory.mjs";
import { transferAmountControl } from "./inventory-quantity-controls.mjs";

import { targetedInventoryRecipient, chooseInventoryRecipient } from "./inventory-recipient.mjs";
export { targetedInventoryRecipient, chooseInventoryRecipient } from "./inventory-recipient.mjs";

export async function transferLooseGroundItem(source, { signal } = {}) {
    const item = looseGroundItem(source);
    if (!item) throw new Error("Ce dépôt ne contient plus un objet libre.");
    return quickInventoryAction(source, item.id, "transfer", { signal });
}

export async function quickInventoryAction(source, itemId, action, { signal } = {}) {
    if (!(source.type === "storage" ? storageAccess(source) : source.isOwner)) throw new Error("Cet inventaire est inaccessible.");
    if (!game.users.activeGM) throw new Error("Un MJ doit être connecté pour déplacer les objets.");
    if (!["transfer", "drop"].includes(action)) throw new Error("Action inconnue.");
    const item = source.items.get(itemId);
    if (!isInventoryItem(item)) throw new Error("Cet objet n’est plus disponible.");
    if (item.type === "weapon" && item.system.corporeal) throw new Error("Déverrouillez l’arme corporelle avant de la déplacer.");
    let target = action === "transfer" ? targetedInventoryRecipient(source) : null;
    let sourceToken;
    if (action === "drop") {
        const tokens = canvas.tokens?.placeables.filter(token => inventoryForToken(token.document)?.uuid === source.uuid) ?? [];
        sourceToken = source.token?.parent?.id === canvas.scene?.id ? source.token
            : tokens.find(token => token.controlled)?.document ?? tokens[0]?.document;
        if (!sourceToken) throw new Error("Placez d’abord le personnage ou le stockage sur la scène active.");
    }
    const maximum = item.type === "object" ? item.system.quantity : 1;
    if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error("La quantité n’est plus disponible.");
    let quantity = maximum;
    if (maximum > 1) {
        const content = document.createElement("div"), label = document.createElement("label");
        label.textContent = action === "transfer" ? "Quantité à transférer " : "Quantité à déposer ";
        label.append(transferAmountControl({ name: "quantity", available: maximum, minimum: 1, value: maximum }));
        content.append(label);
        quantity = await formDialog.prompt({
            window: { title: item.name }, position: { width: 320 }, content, rejectClose: false,
            buttons: [{ action: "cancel", label: "Annuler", callback: () => null }],
            ok: { label: action === "transfer" ? "Transférer" : "Déposer", callback: (_event, button) => {
                const value = button.form.elements.quantity.valueAsNumber;
                if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error("Quantité invalide.");
                return value;
            } }
        });
    }
    if (quantity == null || signal?.aborted) return null;
    if (action === "transfer") {
        target ??= await chooseInventoryRecipient(source, { signal });
        if (!target || signal?.aborted) return null;
    }
    const result = await requestInventoryAction(source, [{ id: item.id, quantity }], {
        action, targetToken: target?.uuid, sourceToken: sourceToken?.uuid, deleteEmptyGround: true
    });
    ui.notifications.info(`${quantity} × ${item.name} ${action === "transfer" ? "transféré(s)" : "déposé(s) au sol"}.`);
    if (result.warning) ui.notifications.warn(result.warning);
    return result;
}

export async function runQuickInventoryAction(sheet, source, target) {
    if (sheet._inventoryQuickBusy) return;
    sheet._inventoryQuickBusy = true;
    sheet._inventoryQuickAbort = new AbortController();
    const buttons = sheet.element.querySelectorAll('[data-action="quickInventory"]');
    for (const button of buttons) button.disabled = true;
    try { return await quickInventoryAction(source, target.dataset.itemId, target.dataset.inventoryAction,
        { signal: sheet._inventoryQuickAbort.signal }); }
    catch (error) { ui.notifications.error(error.message); }
    finally {
        sheet._inventoryQuickBusy = false;
        sheet._inventoryQuickAbort = null;
        for (const button of new Set([...buttons, ...(sheet.element?.querySelectorAll('[data-action="quickInventory"]') ?? [])])) button.disabled = false;
    }
}
