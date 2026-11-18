import { isInventoryItem, isInventoryContainer } from "../inventory.mjs";
import { requestInventoryAction, storageAccess, isGroundDeposit } from "../storage.mjs";
import { inventoryForToken } from "../storage-inventory.mjs";

// Shared by character inventories and storage sheets. DOM construction keeps
// player-authored item names out of HTML strings.
export async function inventoryActionDialog(actor, action, initialId = null) {
    try {
        if (!(actor.type === "storage" ? storageAccess(actor) : actor.isOwner)) return;
        if (!game.users.activeGM) throw new Error("Un MJ doit être connecté pour déplacer les objets.");
        let targetToken, sourceToken;
        if (action === "transfer") {
            const targets = [...game.user.targets];
            if (targets.length !== 1 || !inventoryForToken(targets[0].document)) throw new Error("Ciblez exactement un personnage ou un stockage sur la scène.");
            targetToken = targets[0].document;
            if (inventoryForToken(targetToken).uuid === actor.uuid) throw new Error("Ciblez un autre inventaire.");
        } else {
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
        intro.textContent = action === "transfer" ? `Destinataire : ${targetToken.name}` : "Les objets seront déposés à côté du jeton.";
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
        const items = [...actor.items].filter(isInventoryItem).sort((a,b) => (a.sort ?? 0) - (b.sort ?? 0));
        if (!items.length) throw new Error("Cet inventaire est vide.");
        const selectAll = document.createElement("button");
        selectAll.type = "button";
        selectAll.dataset.transferSelectAll = "";
        selectAll.textContent = "Tout sélectionner / désélectionner";
        const list = document.createElement("div");
        list.className = "aa-transfer-choices";
        picker.append(selectAll, list);
        for (const item of items) {
            const row = document.createElement("div");
            row.className = "aa-transfer-choice";
            const label = document.createElement("label");
            const check = document.createElement("input");
            check.type = "checkbox";
            check.dataset.transferItem = item.id;
            check.defaultChecked = item.id === initialId;
            const name = document.createElement("span");
            const parent = actor.items.get(item.system.containerId);
            name.textContent = `${isInventoryContainer(item) ? "📦 " : ""}${item.name}${parent ? ` (dans ${parent.name})` : ""}${item.system.equipped ? " · équipé" : ""}`;
            label.append(check, name);
            row.append(label);
            let amount;
            if (item.type === "object") {
                amount = document.createElement("input");
                Object.assign(amount, { type: "number", min: "1", max: String(item.system.quantity), step: "1", defaultValue: String(item.system.quantity) });
                amount.dataset.transferQuantity = "";
                amount.setAttribute("aria-label", `Quantité de ${item.name}`);
                row.append(amount);
            }
            list.append(row);
        }
        const choice = await foundry.applications.api.DialogV2.prompt({
            window: { title: action === "transfer" ? "Transférer des objets" : "Déposer au sol" },
            position: { width: 600 }, content, rejectClose: false,
            render: (_event, dialog) => {
                const form = dialog.element;
                form.querySelector("[data-transfer-select-all]").addEventListener("click", () => {
                    const checks = [...form.querySelectorAll("[data-transfer-item]")];
                    const value = checks.some(input => !input.checked);
                    checks.forEach(input => { input.checked = value; });
                });
            },
            buttons: [{ action: "cancel", label: "Annuler", callback: () => null }],
            ok: { label: action === "transfer" ? "Transférer" : "Déposer", callback: (_event, button) => {
                const selected = [...button.form.querySelectorAll("[data-transfer-item]:checked")];
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
        const result = await requestInventoryAction(actor, choice.selections, { action, deleteEmptyGround: choice.deleteEmptyGround,
            targetToken: targetToken?.uuid, sourceToken: sourceToken?.uuid });
        ui.notifications.info(`${result.count} objet(s) ${action === "transfer" ? "transféré(s)" : "déposé(s) au sol"}.`);
        if (result.warning) ui.notifications.warn(result.warning);
    } catch (error) {
        ui.notifications.error(error.message);
    }
}
