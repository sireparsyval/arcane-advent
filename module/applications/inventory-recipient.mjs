import { inventoryActor, storageAccess, looseGroundItem } from "../storage.mjs";
import { inventoryForToken } from "../storage-inventory.mjs";

function validateRecipient(token, source, { actorOnly = false, allowLoosePurse = false } = {}) {
    const destination = inventoryForToken(token);
    if (token?.documentName !== "Token" || token.parent?.id !== canvas.scene?.id
        || token.object?.visible === false || (token.levels?.size && !token.levels.has(canvas.level?.id))
        || (!game.user.isGM && token.hidden) || !inventoryActor(destination) || destination.pack) {
        throw new Error("Choisissez un personnage ou un stockage accessible sur la scène.");
    }
    if (destination.uuid === source.uuid) throw new Error("Choisissez un autre inventaire.");
    if (actorOnly && destination.type === "storage") throw new Error("Choisissez un personnage pour équiper cet objet.");
    if (destination.type === "storage" && !storageAccess(destination)) throw new Error("Ce stockage est verrouillé ou inaccessible.");
    const loose = destination.type === "storage" ? looseGroundItem(destination) : null;
    if (loose && !(allowLoosePurse && loose.type === "purse")) throw new Error("Choisissez un personnage, un contenant ou un stockage destinataire.");
    return token;
}

// Targeting (T) and controlling a token are deliberately independent here.
export function targetedInventoryRecipient(source, targets = game.user.targets, options = {}) {
    const entries = [...targets];
    if (!entries.length) return null;
    if (entries.length !== 1) throw new Error("Ciblez un seul destinataire, ou retirez les cibles pour le choisir au clic.");
    return validateRecipient(entries[0].document, source, options);
}

let cancelPicker;
export function chooseInventoryRecipient(source, { signal, actorOnly = false, allowLoosePurse = false } = {}) {
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
            try { finish(validateRecipient(token?.document, source, { actorOnly, allowLoosePurse })); }
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

export function inventorySourceToken(source) {
    const tokens = canvas.tokens?.placeables.filter(token => inventoryForToken(token.document)?.uuid === source.uuid) ?? [];
    const token = source.token?.parent?.id === canvas.scene?.id ? source.token
        : tokens.find(token => token.controlled)?.document ?? tokens[0]?.document;
    if (!token) throw new Error("Placez d’abord le personnage ou le stockage sur la scène active.");
    return token;
}

