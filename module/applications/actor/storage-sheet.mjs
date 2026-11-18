import { buildInventory, canPlaceInContainer, isInventoryContainer, isInventoryItem } from "../../inventory.mjs";
import { storageAccess, placeStorage } from "../../storage.mjs";
import { inventoryActionDialog } from "../inventory-transfer.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class ArcaneStorageSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ["arcane-advent", "aa-storage-sheet"],
        position: { width: 720, height: 570 },
        window: { resizable: true },
        actions: {
            transfer: function () { return inventoryActionDialog(this.actor, "transfer"); },
            dropGround: function () { return inventoryActionDialog(this.actor, "drop"); },
            place: async function () { try { await placeStorage(this.actor); } catch (error) { ui.notifications.error(error.message); } },
            editItem: function (_event, target) { if (game.user.isGM) this.actor.items.get(target.dataset.itemId)?.sheet.render({ force: true }); },
            moveItem: async function (_event, target) {
                if (!game.user.isGM) return;
                const item = this.actor.items.get(target.dataset.itemId);
                if (!item) return;
                const label = document.createElement("label");
                label.textContent = "Destination ";
                const select = document.createElement("select");
                select.add(new Option("Hors contenant", ""));
                for (const container of this.actor.items) {
                    if (isInventoryContainer(container) && canPlaceInContainer(this.actor.items, item.id, container.id)) {
                        select.add(new Option(container.name, container.id));
                    }
                }
                select.value = item.system.containerId ?? "";
                label.append(select);
                const destination = await foundry.applications.api.DialogV2.prompt({
                    window: { title: "Déplacer dans un contenant" }, content: label, rejectClose: false,
                    buttons: [{ action: "cancel", label: "Annuler", callback: () => false }],
                    ok: { label: "Déplacer", callback: () => select.value }
                });
                if (typeof destination === "string") await this.actor.moveInventoryItem(item.id, destination || null);
            },
            addItem: async function (_event, target) {
                if (!game.user.isGM || !["object", "container", "purse"].includes(target.dataset.type)) return;
                const [item] = await this.actor.createEmbeddedDocuments("Item", [{ type: target.dataset.type,
                    name: target.dataset.type === "container" ? "Nouveau contenant" : target.dataset.type === "purse" ? "Bourse" : "Nouvel objet" }]);
                item?.sheet.render({ force: true });
            }
        }
    };
    static PARTS = { body: { template: "systems/arcane-advent/templates/actor/storage-sheet.hbs", scrollable: [".aa-storage-items"] } };

    get title() { return this.actor.name; }

    _canRender(options) {
        if (!game.user.isGM && !storageAccess(this.actor)) {
            ui.notifications.warn("Ce stockage est verrouillé ou n’est pas accessible sur la scène active.");
            return false;
        }
        return super._canRender(options);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const inventory = buildInventory(this.actor.items);
        const rows = [];
        const visit = (nodes, depth = 0) => {
            for (const node of nodes) {
                rows.push({ id: node.item.id, name: node.item.name, depth,
                    quantity: node.item.type === "object" ? node.item.system.quantity : 1,
                    weight: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(node.weight),
                    container: node.item.type === "container" });
                visit(node.children, depth + 1);
            }
        };
        visit(inventory.roots);
        return { ...context, actor: this.actor, rows, isGM: game.user.isGM,
            locked: this.actor.system.locked, canTransfer: storageAccess(this.actor),
            totalWeight: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(inventory.totalWeight) };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        for (const input of this.element.querySelectorAll("[data-storage-field]")) {
            input.addEventListener("change", async () => {
                if (!game.user.isGM) return;
                const field = input.dataset.storageField;
                const value = field === "system.locked" ? input.checked : input.value.trim();
                if (!["name", "img", "system.locked"].includes(field) || value === "") return;
                try {
                    const changes = { [field]: value };
                    if (field === "img") changes["prototypeToken.texture.src"] = value;
                    if (field === "name") changes["prototypeToken.name"] = value;
                    await this.actor.update(changes);
                    if (field === "img" || field === "name") for (const scene of game.scenes) {
                        const updates = scene.tokens.filter(token => token.actorLink && token.actorId === this.actor.id)
                            .map(token => ({ _id: token.id, [field === "img" ? "texture.src" : "name"]: value }));
                        if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
                    }
                } catch (error) { ui.notifications.error(error.message); }
            });
        }
        // Support native Item drags from the sidebar/compendiums for GM stocking.
        this.element.addEventListener("dragover", event => { if (game.user.isGM) event.preventDefault(); });
        this.element.addEventListener("drop", async event => {
            if (!game.user.isGM) return;
            event.preventDefault();
            event.stopPropagation();
            try {
                const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
                if (data.type !== "Item") return;
                const item = await Item.fromDropData(data);
                if (!isInventoryItem(item) || item.actor) {
                    ui.notifications.warn("Pour déplacer un objet d’un personnage, utilisez Transférer.");
                    return;
                }
                const copy = item.toObject();
                delete copy._id;
                copy.system.containerId = null;
                if ("equipped" in copy.system) copy.system.equipped = false;
                await this.actor.createEmbeddedDocuments("Item", [copy]);
            } catch (error) { ui.notifications.error(error.message); }
        });
    }
}
