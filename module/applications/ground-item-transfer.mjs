import { inventoryActor, looseGroundItem, requestInventoryAction, storageAccess } from "../storage.mjs";
import { inventoryForToken } from "../storage-inventory.mjs";
import { isInventoryItem } from "../inventory.mjs";

function validateRecipient(token, source) {
    const destination = inventoryForToken(token);
    if (token?.documentName !== "Token" || token.parent?.id !== canvas.scene?.id
        || token.object?.visible === false || (token.levels?.size && !token.levels.has(canvas.level?.id))
        || (!game.user.isGM && token.hidden) || !inventoryActor(destination) || destination.pack) {
        throw new Error("Choisissez un personnage ou un stockage accessible sur la scène.");
    }
    if (destination.uuid === source.uuid) throw new Error("Choisissez un autre inventaire.");
    if (destination.type === "storage" && !storageAccess(destination)) throw new Error("Ce stockage est verrouillé ou inaccessible.");
    return token;
}

// Targeting (T) and controlling a token are deliberately independent here.
export function targetedInventoryRecipient(source, targets = game.user.targets) {
    const entries = [...targets];
    if (!entries.length) return null;
    if (entries.length !== 1) throw new Error("Ciblez un seul destinataire, ou retirez les cibles pour le choisir au clic.");
    return validateRecipient(entries[0].document, source);
}

let cancelPicker;
export function chooseInventoryRecipient(source, { signal } = {}) {
    cancelPicker?.();
    if (signal?.aborted) return Promise.resolve(null);
    const view = canvas.app?.view;
    if (!canvas.ready || !view?.addEventListener) throw new Error("Ouvrez une scène pour choisir le destinataire.");
    ui.notifications.info("Cliquez sur le personnage ou le stockage destinataire. Échap ou clic droit pour annuler.");
    return new Promise(resolve => {
        let done = false;
        const finish = token => {
            if (done) return;
            done = true;
            view.removeEventListener("pointerdown", click, true);
            document.removeEventListener("keydown", escape, true);
            signal?.removeEventListener("abort", abort);
            Hooks.off("canvasTearDown", teardown);
            if (cancelPicker === abort) cancelPicker = null;
            resolve(token);
        };
        const abort = () => finish(null);
        const click = event => {
            if (![0, 2].includes(event.button)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.button === 2) return finish(null);
            const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
            const token = [...canvas.tokens.placeables].reverse().find(object => {
                if (object.visible === false || object.renderable === false || (!game.user.isGM && object.document.hidden)
                    || (object.document.levels?.size && !object.document.levels.has(canvas.level?.id))) return false;
                if (object.bounds?.contains) return object.bounds.contains(point.x, point.y);
                const doc = object.document, grid = canvas.scene.grid.size;
                return point.x >= doc.x && point.x <= doc.x + doc.width * grid
                    && point.y >= doc.y && point.y <= doc.y + doc.height * grid;
            });
            try { finish(validateRecipient(token?.document, source)); }
            catch (error) { ui.notifications.warn(error.message); }
        };
        const escape = event => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            finish(null);
        };
        const teardown = Hooks.on("canvasTearDown", abort);
        cancelPicker = abort;
        view.addEventListener("pointerdown", click, true);
        document.addEventListener("keydown", escape, true);
        signal?.addEventListener("abort", abort, { once: true });
    });
}

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
        const content = document.createElement("div"), label = document.createElement("label"), amount = document.createElement("input");
        label.textContent = action === "transfer" ? "Quantité à transférer " : "Quantité à déposer ";
        Object.assign(amount, { name: "quantity", type: "number", min: "1", max: String(maximum), step: "1", defaultValue: String(maximum) });
        label.append(amount);
        content.append(label);
        quantity = await foundry.applications.api.DialogV2.prompt({
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
