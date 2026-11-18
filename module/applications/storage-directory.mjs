import { createStorage, placeStorage, storageAccess } from "../storage.mjs";
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
            open: function (_event, target) { game.actors.get(target.dataset.actorId)?.sheet.render({ force: true }); },
            place: async function (_event, target) {
                try { await placeStorage(game.actors.get(target.dataset.actorId)); }
                catch (error) { ui.notifications.error(error.message); }
            },
            unlockOperation: async function (_event, target) {
                if (!game.user.isGM) return;
                const confirmed = await foundry.applications.api.DialogV2.confirm({
                    window: { title: "Débloquer un inventaire" },
                    content: "<p>À utiliser uniquement après une interruption de connexion, après avoir vérifié les deux inventaires concernés. Débloquer ?</p>", rejectClose: false });
                if (confirmed) await game.actors.get(target.dataset.actorId)?.unsetFlag("arcane-advent", "inventoryBusy");
            }
        }
    };
    static PARTS = { body: { template: "systems/arcane-advent/templates/storage-directory.hbs", scrollable: [".aa-storage-list"] } };
    _hooks = [];
    async _onRender(context, options) {
        await super._onRender(context, options);
        if (this._hooks.length) return;
        for (const name of ["createActor", "updateActor", "deleteActor", "createToken", "deleteToken", "updateToken", "canvasReady"]) {
            this._hooks.push([name, Hooks.on(name, () => this.render({ force: false }))]);
        }
    }
    async _prepareContext(options) {
        return { ...await super._prepareContext(options), isGM: game.user.isGM,
            actors: game.actors.filter(actor => actor.type === "storage" && (storageAccess(actor) || game.user.isGM))
                .map(actor => ({ id: actor.id, name: actor.name, img: actor.img, locked: actor.system.locked })),
            interrupted: game.user.isGM ? game.actors.filter(actor => actor.getFlag("arcane-advent", "inventoryBusy")) : [] };
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
    Hooks.on("renderActorDirectory", (_app, html) => {
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
}
