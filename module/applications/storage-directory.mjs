import { formDialog } from "./form-interactions.mjs";
import { createStorage, placeStorage, storageAccess, isGroundTemplate, isGroundDeposit } from "../storage.mjs";
import { inventoryForDocument } from "../storage-inventory.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class StorageDirectory extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "aa-storage-directory", classes: ["arcane-advent", "aa-storage-directory"],
        position: { width: 650, height: 520 }, window: { title: "Stockages", resizable: true },
        actions: {
            create: async function () {
                if (!game.user.isGM) return;
                try { const actor = await createStorage({ name: "Nouveau stockage" }); actor.sheet.render({ force: true }); }
                catch (error) { ui.notifications.error(error.message); }
            },
            open: async function (_event, target) {
                const actor = await fromUuid(target.dataset.actorUuid);
                actor?.sheet.render({ force: true });
            },
            place: async function (_event, target) {
                try { await placeStorage(await fromUuid(target.dataset.actorUuid)); }
                catch (error) { ui.notifications.error(error.message); }
            },
            unlockOperation: async function (_event, target) {
                if (!game.user.isGM) return;
                const confirmed = await formDialog.confirm({
                    window: { title: "Débloquer un inventaire" },
                    content: "<p>À utiliser uniquement après une interruption de connexion, après avoir vérifié les deux inventaires concernés. Débloquer ?</p>", rejectClose: false });
                if (confirmed) await (await fromUuid(target.dataset.actorUuid))?.unsetFlag("arcane-advent", "inventoryBusy");
            }
        }
    };
    static PARTS = { body: { template: "systems/arcane-advent/templates/storage-directory.hbs", scrollable: [".aa-storage-list"] } };
    _hooks = [];
    async _onRender(context, options) {
        await super._onRender(context, options);
        if (this._hooks.length) return;
        for (const name of ["createActor", "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem", "createToken", "deleteToken", "updateToken", "canvasReady"]) {
            this._hooks.push([name, Hooks.on(name, () => this.render({ force: false }))]);
        }
    }
    async _prepareContext(options) {
        const actors = game.items.filter(item => item.type === "storage").map(inventoryForDocument)
            .concat(game.actors.filter(actor => actor.type === "storage" && !isGroundTemplate(actor)));
        const visible = actors.filter(actor => storageAccess(actor) || game.user.isGM);
        const entry = actor => ({ uuid: actor.uuid, name: actor.name, img: actor.img, locked: actor.system.locked });
        return { ...await super._prepareContext(options), isGM: game.user.isGM,
            actors: visible.filter(actor => !isGroundDeposit(actor)).map(entry),
            groundDeposits: visible.filter(isGroundDeposit).map(entry),
            interrupted: game.user.isGM ? [...actors, ...game.actors.filter(actor => actor.type !== "storage")]
                .filter(actor => actor.getFlag("arcane-advent", "inventoryBusy")).map(entry) : [] };
    }
    async _onClose(options) {
        for (const [name, id] of this._hooks ?? []) Hooks.off(name, id);
        this._hooks = [];
        return super._onClose(options);
    }
}

export function registerStorageDirectory() {
    game.settings.registerMenu("arcane-advent", "storages", { name: "Stockages", label: "Ouvrir les stockages",
        hint: "Sacs au sol, coffres et inventaires partagés.", icon: "fa-solid fa-box-open", type: StorageDirectory, restricted: false });
    Hooks.on("renderItemDirectory", (_app, html) => {
        const root = html instanceof HTMLElement ? html : html[0];
        const footer = root?.querySelector(".directory-footer");
        if (!footer || footer.querySelector(".aa-open-storages")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "aa-open-storages";
        button.textContent = "Stockages";
        button.addEventListener("click", () => new StorageDirectory().render({ force: true }));
        footer.append(button);
    });
    Hooks.on("renderActorDirectory", (_app, html) => {
        const root = html instanceof HTMLElement ? html : html[0];
        for (const row of root?.querySelectorAll(".directory-item[data-entry-id]") ?? []) {
            if (isGroundTemplate(game.actors.get(row.dataset.entryId))) row.remove();
        }
    });
    Hooks.on("dropCanvasData", (_canvas, data) => {
        if (data.type !== "Item" || !game.user.isGM) return;
        const item = fromUuidSync(data.uuid);
        if (item?.type !== "storage" || item.pack || item.actor) return;
        placeStorage(item, canvas.scene, { x: data.x, y: data.y }).catch(error => ui.notifications.error(error.message));
        return false;
    });
    Hooks.on("deleteItem", item => {
        if (item.type !== "storage" || !game.users.activeGM?.isSelf) return;
        for (const scene of game.scenes) {
            const ids = scene.tokens.filter(token => token.getFlag("arcane-advent", "storageItemId") === item.id).map(token => token.id);
            if (ids.length) scene.deleteEmbeddedDocuments("Token", ids).catch(error => ui.notifications.error(error.message));
        }
    });
}
