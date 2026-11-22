import { inventoryForToken } from "./storage-inventory.mjs";
import { storageAccess, isGroundTemplate } from "./storage.mjs";
import { groundMenu, storageContentItems, hasCoins } from "./ground-items.mjs";
import { performGroundAction, groundActionBusy } from "./applications/ground-actions.mjs";

export function renderGroundTokenHUD(app, html) {
    const root = html?.querySelector ? html : html?.[0];
    if (!root || !app.document) return;
    const eye = root.querySelector('[data-action="visibility"]'), elevation = root.querySelector(".col.left .elevation");
    if (eye && elevation) elevation.after(eye);
    const source = inventoryForToken(app.document);
    if (source?.type !== "storage" || isGroundTemplate(source)) return;
    const right = root.querySelector(".col.right");
    if (!right) return;
    right.replaceChildren();
    const view = groundMenu(source), available = storageAccess(source);
    for (const [action, label, icon] of view.actions) {
        const button = root.ownerDocument.createElement("button");
        button.type = "button"; button.className = "control-icon";
        button.dataset.groundAction = action; button.dataset.tooltip = "";
        button.setAttribute("aria-label", label); button.title = label;
        const image = root.ownerDocument.createElement("i"); image.className = `fa-solid ${icon}`; image.setAttribute("aria-hidden", "true"); button.append(image);
        button.disabled = !available || groundActionBusy(source)
            || (["coinsAll", "coinsPart", "coinsDrop"].includes(action) && !hasCoins(view.item.system.coins))
            || (["contents", "selection", "dropSelection"].includes(action) && !storageContentItems(source).length);
        button.addEventListener("click", async event => {
            event.preventDefault(); event.stopPropagation(); button.disabled = true;
            const token = app.document;
            try { await performGroundAction(source, action, { token }); }
            catch (error) { ui.notifications.error(error.message); }
            finally {
                // Picking up the last item can delete the token and unbind its
                // HUD before the transfer completes. Never refresh another HUD.
                if (app.document?.uuid === token.uuid) {
                    if (token.parent.tokens.has(token.id)) app.render({ force: true });
                    else app.close();
                }
            }
        });
        right.append(button);
    }
    if (!game.user.isGM && !app.object?.isOwner) {
        for (const control of root.querySelectorAll('.col.left input, .col.left button:not([data-action="visibility"])')) control.disabled = true;
    }
}

export function registerGroundTokenHUD() {
    Hooks.on("renderTokenHUD", renderGroundTokenHUD);
    const Token = CONFIG.Token.objectClass, previous = Token.prototype._canHUD;
    Token.prototype._canHUD = function (user, event) {
        const source = inventoryForToken(this.document);
        if (source?.type !== "storage" || !storageAccess(source, user)) return previous.call(this, user, event);
        if (!this.layer.active || canvas.regions?._placementContext || this.layer._draggedToken || canvas.controls?.ruler?.active
            || (CONFIG.Canvas.rulerClass?.canMeasure && event?.type === "pointerdown")) return false;
        return true;
    };
    Hooks.on("updateItem", item => {
        const hud = canvas.hud?.token;
        if (hud?.rendered && inventoryForToken(hud.document)?.uuid === item.uuid) hud.render({ force: true });
    });
}
