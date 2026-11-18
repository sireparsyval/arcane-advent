import { isInventoryItem, isInventoryContainer } from "../inventory.mjs";
import { requestInventoryAction, storageAccess } from "../storage.mjs";

// Shared by character inventories and storage sheets. DOM construction keeps
// player-authored item names out of HTML strings.
export async function inventoryActionDialog(actor, action, initialId = null) {
    try {
        if (!(actor.type === "storage" ? storageAccess(actor) : actor.isOwner)) return;
        if (!game.users.activeGM) throw new Error("Un MJ doit être connecté pour déplacer les objets.");
        let targetToken, sourceToken;
        if (action === "transfer") {
            const targets = [...game.user.targets];
            if (targets.length !== 1 || !targets[0].actor) throw new Error("Ciblez exactement un personnage ou un stockage sur la scène.");
            targetToken = targets[0].document;
            if (targetToken.actor.uuid === actor.uuid) throw new Error("Ciblez un autre inventaire.");
        } else {
            const tokens = canvas.tokens?.placeables.filter(token => token.actor?.uuid === actor.uuid) ?? [];
            sourceToken = actor.token?.parent?.id === canvas.scene?.id ? actor.token
                : tokens.find(token => token.controlled)?.document ?? tokens[0]?.document;
            if (!sourceToken) throw new Error("Placez d’abord le personnage ou le stockage sur la scène active.");
        }
        const content = document.createElement("div");
        content.className = "aa-transfer-picker";
        const intro = document.createElement("p");
        intro.textContent = action === "transfer" ? `Destinataire : ${targetToken.name}` : "Les objets seront déposés à côté du jeton.";
        const note = document.createElement("p");
        note.textContent = "Un contenant sélectionné emporte tout son contenu. Les équipements reçus sont rangés dans l’inventaire.";
        content.append(intro, note);
        const items = [...actor.items].filter(isInventoryItem).sort((a,b) => (a.sort ?? 0) - (b.sort ?? 0));
        if (!items.length) throw new Error("Cet inventaire est vide.");
        const selectAll = document.createElement("button");
        selectAll.type = "button";
        selectAll.textContent = "Tout sélectionner / désélectionner";
        const list = document.createElement("div");
        list.className = "aa-transfer-choices";
        selectAll.addEventListener("click", () => {
            const checks = [...list.querySelectorAll('input[type="checkbox"]')];
            const value = checks.some(input => !input.checked);
            checks.forEach(input => { input.checked = value; });
        });
        content.append(selectAll, list);
        const fields = [];
        for (const item of items) {
            const row = document.createElement("div");
            row.className = "aa-transfer-choice";
            const label = document.createElement("label");
            const check = document.createElement("input");
            check.type = "checkbox";
            check.checked = item.id === initialId;
            const name = document.createElement("span");
            const parent = actor.items.get(item.system.containerId);
            name.textContent = `${isInventoryContainer(item) ? "📦 " : ""}${item.name}${parent ? ` (dans ${parent.name})` : ""}${item.system.equipped ? " · équipé" : ""}`;
            label.append(check, name);
            row.append(label);
            let amount;
            if (item.type === "object") {
                amount = document.createElement("input");
                Object.assign(amount, { type: "number", min: "1", max: String(item.system.quantity), step: "1", value: String(item.system.quantity) });
                amount.setAttribute("aria-label", `Quantité de ${item.name}`);
                row.append(amount);
            }
            fields.push({ item, check, amount });
            list.append(row);
        }
        const selections = await foundry.applications.api.DialogV2.prompt({
            window: { title: action === "transfer" ? "Transférer des objets" : "Déposer au sol" },
            position: { width: 600 }, content, rejectClose: false,
            buttons: [{ action: "cancel", label: "Annuler", callback: () => null }],
            ok: { label: action === "transfer" ? "Transférer" : "Déposer", callback: () => {
                const selected = fields.filter(field => field.check.checked);
                if (!selected.length) throw new Error("Sélectionnez au moins un objet.");
                return selected.map(({ item, amount }) => {
                    const quantity = amount ? amount.valueAsNumber : 1;
                    if (!Number.isSafeInteger(quantity) || quantity < 1 || (amount && quantity > Number(amount.max))) {
                        throw new Error(`Quantité invalide : ${item.name}.`);
                    }
                    return { id: item.id, quantity };
                });
            } }
        });
        if (!selections) return;
        const result = await requestInventoryAction(actor, selections, { action,
            targetToken: targetToken?.uuid, sourceToken: sourceToken?.uuid });
        ui.notifications.info(`${result.count} objet(s) ${action === "transfer" ? "transféré(s)" : "déposé(s) au sol"}.`);
    } catch (error) {
        ui.notifications.error(error.message);
    }
}
