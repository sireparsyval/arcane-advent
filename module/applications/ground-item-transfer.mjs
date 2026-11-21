import { inventoryActor, looseGroundItem, requestInventoryAction, storageAccess } from "../storage.mjs";
import { inventoryForToken } from "../storage-inventory.mjs";

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
    if (!storageAccess(source)) throw new Error("Ce dépôt est verrouillé ou inaccessible.");
    if (!game.users.activeGM) throw new Error("Un MJ doit être connecté pour déplacer les objets.");
    const item = looseGroundItem(source);
    if (!item) throw new Error("Ce dépôt ne contient plus un objet libre.");
    let target = targetedInventoryRecipient(source);
    const maximum = item.type === "object" ? item.system.quantity : 1;
    if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error("La quantité n’est plus disponible.");
    let quantity = maximum;
    if (maximum > 1) {
        const content = document.createElement("div"), label = document.createElement("label"), amount = document.createElement("input");
        label.textContent = "Quantité à transférer ";
        Object.assign(amount, { name: "quantity", type: "number", min: "1", max: String(maximum), step: "1", defaultValue: String(maximum) });
        label.append(amount);
        content.append(label);
        quantity = await foundry.applications.api.DialogV2.prompt({
            window: { title: item.name }, position: { width: 320 }, content, rejectClose: false,
            buttons: [{ action: "cancel", label: "Annuler", callback: () => null }],
            ok: { label: "Transférer", callback: (_event, button) => {
                const value = button.form.elements.quantity.valueAsNumber;
                if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error("Quantité invalide.");
                return value;
            } }
        });
    }
    if (quantity == null || signal?.aborted) return null;
    target ??= await chooseInventoryRecipient(source, { signal });
    if (!target || signal?.aborted) return null;
    const result = await requestInventoryAction(source, [{ id: item.id, quantity }], {
        action: "transfer", targetToken: target.uuid, deleteEmptyGround: true
    });
    ui.notifications.info(`${quantity} × ${item.name} transféré(s).`);
    if (result.warning) ui.notifications.warn(result.warning);
    return result;
}
