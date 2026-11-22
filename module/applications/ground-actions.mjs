import { formDialog } from "./form-interactions.mjs";
import { requestInventoryAction, storageAccess, inventoryActor } from "../storage.mjs";
import { groundMenu, mainGroundContainer, checkedCoins, hasCoins } from "../ground-items.mjs";
import { LUQA_DENOMINATIONS } from "../inventory.mjs";
import { chooseInventoryItems } from "./inventory-transfer.mjs";
import { targetedInventoryRecipient, chooseInventoryRecipient, inventorySourceToken } from "./inventory-recipient.mjs";
import { transferAmountControl, bindTransferAmounts, transferSelectionButtons, bindTransferSelection, bindTransferSubmit } from "./inventory-quantity-controls.mjs";

const busy = new Set();
export const groundActionBusy = source => busy.has(source.uuid);

async function quantityDialog(item, { split = false } = {}) {
    const maximum = item.system.quantity - (split ? 1 : 0);
    const content = document.createElement("div"), label = document.createElement("label");
    label.textContent = split ? "Quantité de la nouvelle pile " : "Quantité à transférer ";
    label.append(transferAmountControl({ name: "quantity", available: item.system.quantity, maximum, minimum: 1,
        value: split ? Math.max(1, Math.floor(item.system.quantity / 2)) : maximum })); content.append(label);
    return formDialog.prompt({ window: { title: split ? "Scinder la pile" : item.name }, position: { width: 340 }, content, rejectClose: false,
        buttons: [{ action: "cancel", label: "Annuler", callback: () => null }],
        ok: { label: split ? "Scinder" : "Transférer", callback: (_event, button) => {
            const amount = button.form.elements.quantity.valueAsNumber;
            if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum) throw Error("Quantité invalide.");
            return amount;
        } } });
}

export async function chooseLuqa(purse, title, { operations = false } = {}) {
    const coins = checkedCoins(purse.system.coins);
    if (!hasCoins(coins) && !operations) throw Error("Cette bourse ne contient aucun Luqa.");
    const content = document.createElement("div"), list = document.createElement("div");
    list.className = "aa-transfer-picker";
    for (const { key, symbol, label } of LUQA_DENOMINATIONS) {
        const row = document.createElement("div"); row.className = "aa-transfer-choice aa-luqa-choice"; row.dataset.unitWeight = "0.01";
        const amount = transferAmountControl({ name: key, available: coins[key], disabled: coins[key] === 0 });
        amount.children[0].setAttribute("aria-label", `Quantité de ${label}`);
        const icon = document.createElement("span"); icon.className = "aa-transfer-icon"; icon.textContent = symbol;
        const name = document.createElement("span"); name.className = "aa-transfer-name"; name.textContent = label;
        const weight = document.createElement("span"); weight.className = "aa-transfer-weight"; weight.textContent = "0 kg";
        row.append(amount, icon, name, weight); list.append(row);
    }
    content.append(list, transferSelectionButtons());
    const read = (_event, button) => {
        const selected = Object.fromEntries(LUQA_DENOMINATIONS.map(({ key }) => [key,
            button.form.elements[key].valueAsNumber]));
        checkedCoins(selected);
        if (!hasCoins(selected) || Object.keys(selected).some(key => selected[key] > coins[key])) throw Error("Sélection de Luqa invalide.");
        return selected;
    };
    const options = { window: { title }, position: { width: 600 }, content, rejectClose: false,
        render: (_event, dialog) => {
            const root = dialog.element;
            bindTransferAmounts(root);
            const refresh = bindTransferSubmit(root, () => {
                const values = LUQA_DENOMINATIONS.map(({ key }) => [key, root.querySelector('[name="' + key + '"]').valueAsNumber]);
                return values.some(([, value]) => value > 0) && values.every(([key, value]) => Number.isSafeInteger(value) && value >= 0 && value <= coins[key]);
            });
            bindTransferSelection(root, refresh);
        } };
    const cancel = { action: "cancel", label: "Annuler", type: "button", callback: () => false };
    if (operations) return formDialog.wait({ ...options, buttons: [
        cancel,
        { action: "transfer", label: "Transférer", default: true, callback: (event, button) => {
            const selected = read(event, button);
            return { action: Object.keys(coins).every(key => selected[key] === coins[key]) ? "coinsAll" : "coinsPart", coins: selected };
        } },
        { action: "drop", label: purse.system.coinPile ? "Scinder" : "Déposer",
            callback: (event, button) => ({ action: purse.system.coinPile ? "coinsSplit" : "coinsDrop", coins: read(event, button) }) }
    ] });
    return formDialog.prompt({ ...options, buttons: [cancel], ok: { label: "Valider", callback: read } });
}

export async function performGroundAction(source, action, { token, itemId, coins: selectedCoins } = {}) {
    if (busy.has(source.uuid)) return;
    if (!inventoryActor(source) || !(source.type === "storage" ? storageAccess(source) : source.isOwner)) throw Error("Cet inventaire est inaccessible.");
    busy.add(source.uuid);
    try {
        const view = source.type === "storage" ? groundMenu(source) : null;
        const item = source.items.get(itemId ?? view?.item?.id);
        const receiving = !["split", "dropSelection", "coinsDrop", "coinsSplit"].includes(action);
        const recipientOptions = { actorOnly: action === "equip", allowLoosePurse: ["coinsAll", "coinsPart"].includes(action) };
        let target = receiving ? targetedInventoryRecipient(source, game.user.targets, recipientOptions) : null;
        const options = { action: "transfer", deleteEmptyGround: true };
        let selections = [];
        if (["take", "equip", "takePart", "split"].includes(action)) {
            if (!item) throw Error("Cet objet n’est plus disponible.");
            const maximum = item.type === "object" ? item.system.quantity : 1;
            const quantity = action === "takePart" || action === "split" ? await quantityDialog(item, { split: action === "split" }) : maximum;
            if (quantity == null) return;
            selections = [{ id: item.id, quantity }];
            if (action === "split") { options.action = "split"; options.sourceToken = (token ?? inventorySourceToken(source)).uuid; }
            if (action === "equip") options.action = "equip";
        } else if (["coinsAll", "coinsPart", "coinsDrop", "coinsSplit"].includes(action)) {
            if (item?.type !== "purse") throw Error("Choisissez une bourse.");
            options.action = { coinsAll: "coinAll", coinsPart: "coinPart", coinsDrop: "coinDrop", coinsSplit: "coinSplit" }[action];
            options.purseId = item.id;
            if (action !== "coinsAll") { options.coins = selectedCoins ?? await chooseLuqa(item, action === "coinsDrop" ? "Déposer des Luqa" : action === "coinsSplit" ? "Scinder le tas de Luqa" : "Transférer des Luqa"); if (!options.coins) return; }
            if (["coinsDrop", "coinsSplit"].includes(action)) options.sourceToken = (token ?? inventorySourceToken(source)).uuid;
        } else if (action === "takeStorage") options.action = "takeStorage";
        else if (action === "contents") { options.action = "transferContents"; options.deleteEmptyGround = false; }
        else if (action === "selection" || action === "dropSelection") {
            const main = mainGroundContainer(source);
            const choice = await chooseInventoryItems(source, { excludeIds: main ? [main.id] : [], title: action === "selection" ? "Transférer une partie du contenu" : "Déposer une partie du contenu" });
            if (!choice) return;
            selections = choice.selections; options.deleteEmptyGround = false;
            if (action === "dropSelection") { options.action = "drop"; options.sourceToken = (token ?? inventorySourceToken(source)).uuid; }
        } else throw Error("Action inconnue.");
        if (receiving) { target ??= await chooseInventoryRecipient(source, recipientOptions); if (!target) return; options.targetToken = target.uuid; }
        const result = await requestInventoryAction(source, selections, options);
        ui.notifications.info(["split", "coinsSplit"].includes(action) ? "La pile a été scindée." : receiving ? "Transfert effectué." : "Dépôt effectué.");
        if (result.warning) ui.notifications.warn(result.warning);
        return result;
    } finally { busy.delete(source.uuid); }
}

export async function openPurseActions(source, itemId, token) {
    const purse = source.items.get(itemId);
    if (purse?.type !== "purse") return;
    const choice = await chooseLuqa(purse, `Luqa — ${purse.name}`, { operations: true });
    if (choice) return performGroundAction(source, choice.action, { token, itemId, coins: choice.coins });
}
