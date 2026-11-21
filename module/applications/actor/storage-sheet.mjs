import { buildInventory, canPlaceInContainer, isInventoryContainer, isInventoryItem } from "../../inventory.mjs";
import { storageAccess, placeStorage, isGroundTemplate, isGroundDeposit, looseGroundItem } from "../../storage.mjs";
import { inventoryActionDialog } from "../inventory-transfer.mjs";
import { inventoryForDocument, inventoryForToken } from "../../storage-inventory.mjs";
import { runQuickInventoryAction } from "../ground-item-transfer.mjs";

const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const storageSheet = Base => class extends HandlebarsApplicationMixin(Base) {
    static DEFAULT_OPTIONS = {
        classes: ["arcane-advent", "aa-storage-sheet"],
        position: { width: 720, height: 570 },
        window: { resizable: true },
        actions: {
            quickInventory: function (_event, target) { return runQuickInventoryAction(this, this.inventoryHost, target); },
            transfer: function () { return inventoryActionDialog(this.inventoryHost, "transfer"); },
            dropGround: function () { return inventoryActionDialog(this.inventoryHost, "drop"); },
            place: async function () { try { await placeStorage(this.inventoryHost); } catch (error) { ui.notifications.error(error.message); } },
            editItem: function (_event, target) { if (game.user.isGM) this.inventoryHost.items.get(target.dataset.itemId)?.sheet.render({ force: true }); },
            moveItem: async function (_event, target) {
                if (!game.user.isGM) return;
                const item = this.inventoryHost.items.get(target.dataset.itemId);
                if (!item) return;
                const content = document.createElement("div");
                const label = document.createElement("label");
                label.textContent = "Destination ";
                const select = document.createElement("select");
                select.name = "destination";
                const current = item.system.containerId ?? "";
                select.add(new Option("Hors contenant", "", current === ""));
                for (const container of this.inventoryHost.items) {
                    if (isInventoryContainer(container) && canPlaceInContainer(this.inventoryHost.items, item.id, container.id)) {
                        select.add(new Option(container.name, container.id, current === container.id));
                    }
                }
                label.append(select);
                content.append(label);
                const destination = await foundry.applications.api.DialogV2.prompt({
                    window: { title: "Déplacer dans un contenant" }, content, rejectClose: false,
                    buttons: [{ action: "cancel", label: "Annuler", callback: () => false }],
                    ok: { label: "Déplacer", callback: (_event, button) => button.form.elements.destination.value }
                });
                if (typeof destination === "string") await this.inventoryHost.moveInventoryItem(item.id, destination || null);
            },
            addItem: async function (_event, target) {
                if (!game.user.isGM || !["object", "container", "purse"].includes(target.dataset.type)) return;
                try {
                    const [item] = await this.inventoryHost.createEmbeddedDocuments("Item", [{ type: target.dataset.type,
                        name: target.dataset.type === "container" ? "Nouveau contenant" : target.dataset.type === "purse" ? "Bourse" : "Nouvel objet" }]);
                    item?.sheet.render({ force: true });
                } catch (error) { ui.notifications.error(error.message); }
            }
        }
    };
    static PARTS = { body: { template: "systems/arcane-advent/templates/actor/storage-sheet.hbs", scrollable: [".aa-storage-items"] } };

    get inventoryHost() { return inventoryForDocument(this.document); }
    get title() { return this.inventoryHost?.name ?? this.document.name; }
    _storageHooks = [];
    // Our drop listener stocks the storage Item. The native Actor drop would
    // instead put an invisible copy in the technical token Actor.
    _canDragDrop() { return false; }

    _canRender(options) {
        if (!this.inventoryHost) {
            ui.notifications.warn("L’objet associé à ce jeton n’existe plus.");
            return false;
        }
        if (isGroundTemplate(this.inventoryHost)) {
            ui.notifications.warn("Ouvrez le dépôt directement sur la scène pour consulter son contenu.");
            return false;
        }
        if (!game.user.isGM && !storageAccess(this.inventoryHost)) {
            ui.notifications.warn("Ce stockage est verrouillé ou n’est pas accessible sur la scène active.");
            return false;
        }
        return super._canRender(options);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const inventory = buildInventory(this.inventoryHost.items);
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
        const loose = looseGroundItem(this.inventoryHost);
        return { ...context, actor: this.inventoryHost, rows, isGM: game.user.isGM,
            looseItem: loose ? { id: loose.id, name: loose.name, img: loose.img || this.inventoryHost.img,
                quantity: loose.type === "object" ? loose.system.quantity : 1 } : null,
            ground: isGroundDeposit(this.inventoryHost), canPlace: game.user.isGM && !isGroundDeposit(this.inventoryHost),
            locked: this.inventoryHost.system.locked, canTransfer: storageAccess(this.inventoryHost),
            totalWeight: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(inventory.totalWeight) };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        if (this._looseLayout !== Boolean(context.looseItem)) {
            this._looseLayout = Boolean(context.looseItem);
            this.setPosition(this._looseLayout ? { width: 360, height: "auto" } : { width: 720, height: 570 });
        }
        if (!this._storageHooks.length && this.inventoryHost.document) {
            const storageUuid = this.inventoryHost.uuid;
            this._storageHooks.push(["updateItem", Hooks.on("updateItem", item => {
                if (item.uuid === storageUuid) this.render({ force: false });
            })]);
            this._storageHooks.push(["deleteItem", Hooks.on("deleteItem", item => {
                if (item.uuid === storageUuid) this.close();
            })]);
        }
        if (this._inventoryQuickBusy) for (const button of this.element.querySelectorAll('[data-action="quickInventory"]')) button.disabled = true;
        if (context.looseItem) return;
        for (const input of this.element.querySelectorAll("[data-storage-field]")) {
            input.addEventListener("change", async () => {
                if (!game.user.isGM) return;
                const field = input.dataset.storageField;
                const value = field === "system.locked" ? input.checked : input.value.trim();
                if (!["name", "img", "system.locked"].includes(field) || value === "") return;
                try {
                    const changes = { [field]: value };
                    if (!this.inventoryHost.document) {
                        if (field === "img") changes["prototypeToken.texture.src"] = value;
                        if (field === "name") changes["prototypeToken.name"] = value;
                    }
                    await this.inventoryHost.update(changes);
                    if (field === "img" || field === "name") for (const scene of game.scenes) {
                        const updates = scene.tokens.filter(token => inventoryForToken(token)?.uuid === this.inventoryHost.uuid)
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
                await this.inventoryHost.createEmbeddedDocuments("Item", [copy]);
            } catch (error) { ui.notifications.error(error.message); }
        });
    }

    async _onClose(options) {
        this._inventoryQuickAbort?.abort();
        for (const [name, id] of this._storageHooks) Hooks.off(name, id);
        this._storageHooks = [];
        return super._onClose(options);
    }
};

export class ArcaneStorageSheet extends storageSheet(ActorSheetV2) {}
export class ArcaneStorageItemSheet extends storageSheet(ItemSheetV2) {}
