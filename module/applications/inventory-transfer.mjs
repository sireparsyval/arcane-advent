import { formDialog } from "./form-interactions.mjs";
import { isInventoryItem } from "../inventory.mjs";
import { requestInventoryAction, storageAccess, isGroundDeposit } from "../storage.mjs";
import { inventoryForToken } from "../storage-inventory.mjs";
import { inventorySelectionRows } from "../ground-items.mjs";
import { targetedInventoryRecipient, chooseInventoryRecipient } from "./inventory-recipient.mjs";

// Shared by character inventories and storage sheets. DOM construction keeps
// player-authored item names out of HTML strings.
export async function inventoryActionDialog(actor, action, initialId = null, { excludeIds = [], title } = {}) {
    try {
        if (!(actor.type === "storage" ? storageAccess(actor) : actor.isOwner)) return;
        if (!game.users.activeGM) throw new Error("Un MJ doit être connecté pour déplacer les objets.");
        let targetToken, sourceToken;
        if (action === "transfer") {
            targetToken = targetedInventoryRecipient(actor);
        } else if (action === "drop") {
            const tokens = canvas.tokens?.placeables.filter(token => inventoryForToken(token.document)?.uuid === actor.uuid) ?? [];
            sourceToken = actor.token?.parent?.id === canvas.scene?.id ? actor.token
                : tokens.find(token => token.controlled)?.document ?? tokens[0]?.document;
            if (!sourceToken) throw new Error("Placez d’abord le personnage ou le stockage sur la scène active.");
        }
        const content = document.createElement("div");
        // DialogV2 requires an attribute-free outer div and serializes its
        // children. Keep styling inside and bind/read only the rendered DOM.
        const picker = document.createElement("div");
        picker.className = "aa-transfer-picker";
        content.append(picker);
        const intro = document.createElement("p");
        intro.textContent = action === "transfer" && targetToken ? `Destinataire : ${targetToken.name}`
            : action === "drop" ? "Les objets seront déposés à côté du jeton." : "Choisissez les objets et les quantités.";
        const note = document.createElement("p");
        note.textContent = "Un contenant sélectionné emporte tout son contenu. Les équipements reçus sont rangés dans l’inventaire.";
        picker.append(intro, note);
        if (action === "transfer" && isGroundDeposit(actor)) {
            const label = document.createElement("label");
            label.className = "aa-transfer-cleanup";
            const check = document.createElement("input");
            check.type = "checkbox";
            check.dataset.deleteEmptyGround = "";
            label.append(check, " Supprimer le dépôt s’il est vide après le transfert");
            picker.append(label);
        }
        const entries = inventorySelectionRows(actor.items).filter(entry => isInventoryItem(entry.item) && !excludeIds.includes(entry.item.id));
        const items = entries.map(entry => entry.item);
        if (!items.length) throw new Error("Cet inventaire est vide.");
        const selectAll = document.createElement("button");
        selectAll.type = "button";
        selectAll.dataset.transferSelectAll = "";
        selectAll.textContent = "Tout sélectionner / désélectionner";
        const list = document.createElement("div");
        list.className = "aa-transfer-choices";
        picker.append(selectAll, list);
        for (const item of items) {
            const entry = entries.find(entry => entry.item === item);
            const row = document.createElement("div");
            row.className = "aa-transfer-choice";
            const label = document.createElement("label");
            const check = document.createElement("input");
            check.type = "checkbox";
            check.dataset.transferItem = item.id;
            check.defaultChecked = item.id === initialId;
            check.disabled = item.type === "weapon" && item.system.corporeal;
            const icon = document.createElement("span");
            icon.className = "aa-transfer-icon";
            if (entry.icon) icon.textContent = entry.icon;
            else if (item.img) { const image = document.createElement("img"); image.src = item.img; image.alt = ""; icon.append(image); }
            const name = document.createElement("span");
            name.className = "aa-transfer-name";
            name.style.paddingInlineStart = `${entry.depth * 12}px`;
            name.textContent = `${item.name}${item.system.equipped ? " · équipé" : ""}`;
            label.append(check, icon, name);
            row.append(label);
            let amount;
            if (item.type === "object") {
                amount = document.createElement("input");
                Object.assign(amount, { type: "number", min: "1", max: String(item.system.quantity), step: "1", defaultValue: String(item.system.quantity) });
                amount.dataset.transferQuantity = "";
                amount.dataset.unitWeight = String(item.system.weight ?? 0);
                amount.setAttribute("aria-label", `Quantité de ${item.name}`);
                row.append(amount);
            } else { const quantity = document.createElement("span"); quantity.className = "aa-transfer-quantity"; quantity.textContent = "1"; row.append(quantity); }
            const weight = document.createElement("span");
            weight.className = "aa-transfer-weight";
            weight.textContent = `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(entry.weight)} kg`;
            row.append(weight);
            list.append(row);
        }
        const choice = await formDialog.prompt({
            window: { title: title ?? (action === "transfer" ? "Transférer des objets" : action === "drop" ? "Déposer au sol" : "Sélectionner des objets") },
            position: { width: 600 }, content, rejectClose: false,
            render: (_event, dialog) => {
                const form = dialog.element;
                form.querySelector("[data-transfer-select-all]").addEventListener("click", () => {
                    const checks = [...form.querySelectorAll("[data-transfer-item]:not(:disabled)")];
                    const value = checks.some(input => !input.checked);
                    checks.forEach(input => { input.checked = value; });
                });
                for (const quantity of form.querySelectorAll("[data-transfer-quantity]")) quantity.addEventListener("input", () => {
                    quantity.closest(".aa-transfer-choice").querySelector(".aa-transfer-weight").textContent = `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(quantity.valueAsNumber * Number(quantity.dataset.unitWeight))} kg`;
                });
            },
            buttons: [{ action: "cancel", label: "Annuler", callback: () => null }],
            ok: { label: action === "transfer" ? "Transférer" : action === "drop" ? "Déposer" : "Valider", callback: (_event, button) => {
                const selected = [...button.form.querySelectorAll("[data-transfer-item]:checked:not(:disabled)")];
                if (!selected.length) throw new Error("Sélectionnez au moins un objet.");
                const selections = selected.map(check => {
                    const item = actor.items.get(check.dataset.transferItem);
                    if (!item) throw new Error("Un objet sélectionné n’est plus disponible.");
                    const amount = check.closest(".aa-transfer-choice").querySelector("[data-transfer-quantity]");
                    const quantity = amount ? amount.valueAsNumber : 1;
                    if (!Number.isSafeInteger(quantity) || quantity < 1 || (amount && quantity > Number(amount.max))) {
                        throw new Error(`Quantité invalide : ${item.name}.`);
                    }
                    return { id: item.id, quantity };
                });
                return { selections, deleteEmptyGround: button.form.querySelector("[data-delete-empty-ground]")?.checked === true };
            } }
        });
        if (!choice) return;
        if (action === "select") return choice;
        if (action === "transfer") { targetToken ??= await chooseInventoryRecipient(actor); if (!targetToken) return; }
        const result = await requestInventoryAction(actor, choice.selections, { action, deleteEmptyGround: choice.deleteEmptyGround,
            targetToken: targetToken?.uuid, sourceToken: sourceToken?.uuid });
        ui.notifications.info(`${result.count} objet(s) ${action === "transfer" ? "transféré(s)" : "déposé(s) au sol"}.`);
        if (result.warning) ui.notifications.warn(result.warning);
    } catch (error) {
        ui.notifications.error(error.message);
    }
}

export function chooseInventoryItems(actor, options) { return inventoryActionDialog(actor, "select", null, options); }
