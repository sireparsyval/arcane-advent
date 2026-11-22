import { isInventoryContainer, luqaCounters } from "../../inventory.mjs";
import { WEAPON_PROPERTIES } from "../../expertise.mjs";
import { storageInventoryOwner } from "../../storage-inventory.mjs";
import { ammunitionItems } from "../../weapon-ammunition.mjs";
import { bindFieldEnter, formDialog } from "../form-interactions.mjs";
import { storageAccess, looseGroundItem } from "../../storage.mjs";
import { groundMenu } from "../../ground-items.mjs";
import { openPurseActions, performGroundAction } from "../ground-actions.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const PROTECTION_ZONES = {
    head: "Tête",
    torso: "Torse",
    arms: "Bras",
    legs: "Jambes"
};

function choices(labels, selected) {
    return Object.entries(labels).map(([key, label]) => ({
        key, label, checked: selected.has(key)
    }));
}

function selectedChoices(form, attribute, labels, previous) {
    const retained = [...previous].filter(key => !Object.hasOwn(labels, key));
    const checked = form.querySelectorAll(`[${attribute}]:checked`);
    return [...retained, ...Array.from(checked, input => input.value)];
}

function reductionChanges(form, previous) {
    const edited = new Map();
    const seen = new Set();
    for (const row of form.querySelectorAll("[data-reduction-row]")) {
        const key = row.querySelector("[data-reduction-type]").value.trim();
        const value = row.querySelector("[data-reduction-value]").valueAsNumber;
        const normalizedKey = key.toLowerCase();
        if (!key || key.includes(".") || /^(?:-=|==)/.test(key)
            || ["__proto__", "constructor", "prototype"].includes(normalizedKey)) {
            throw new Error("Saisissez un type de dégâts valide pour chaque réduction.");
        }
        if (seen.has(normalizedKey)) {
            throw new Error(`Une réduction existe déjà pour « ${key} ».`);
        }
        seen.add(normalizedKey);
        edited.set(key, value);
    }

    const changes = [...edited].filter(([key, value]) => previous[key] !== value);
    for (const key of Object.keys(previous)) {
        if (!edited.has(key)) changes.push([key, new foundry.data.operators.ForcedDeletion()]);
    }
    return Object.fromEntries(changes);
}

export class ArcaneInventoryItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ["arcane-advent", "aa-inventory-item-sheet"],
        position: { width: 520, height: "auto" },
        form: { submitOnChange: false, closeOnSubmit: true },
        actions: {
            groundAction: async function (_event, target) {
                const owner = storageInventoryOwner(this.document);
                if (!owner || this._groundBusy) return;
                this._groundBusy = true;
                for (const button of this.element.querySelectorAll("[data-action=groundAction]")) button.disabled = true;
                try { await performGroundAction(owner, target.dataset.groundAction, { itemId: this.document.id }); }
                catch (error) { ui.notifications.error(error.message); }
                finally { this._groundBusy = false; if (this.rendered && owner.items.has(this.document.id)) this.render({ force: false }); }
            },
            purseActions: async function () {
                if (!this.isEditable) return;
                const owner = this.document.actor ?? storageInventoryOwner(this.document);
                try { if (owner) await openPurseActions(owner, this.document.id); }
                catch (error) { ui.notifications.error(error.message); }
            },
            addReduction: this.#onAddReduction,
            removeReduction: this.#onRemoveReduction,
            deleteInventoryItem: this.#onDelete
        }
    };

    static PARTS = {
        editor: {
            template: "systems/arcane-advent/templates/item/inventory-item-sheet.hbs",
            scrollable: [""]
        }
    };

    _initializeApplicationOptions(options) {
        const prepared = super._initializeApplicationOptions(options);
        const storage = storageInventoryOwner(prepared.document);
        if (storage) prepared.uniqueId = `${this.constructor.name}-${storage.id}-${prepared.document.id}`;
        return prepared;
    }

    _storageHooks = [];
    get isEditable() {
        const storage = storageInventoryOwner(this.document);
        return storage ? storage.isOwner && storageAccess(storage) : super.isEditable;
    }
    _canRender(options) {
        const storage = storageInventoryOwner(this.document);
        if (storage) return storageAccess(storage) ? undefined : false;
        return super._canRender(options);
    }
    async _onClose(options) {
        for (const [name, id] of this._storageHooks) Hooks.off(name, id);
        this._storageHooks = [];
        return super._onClose(options);
    }
    _getFrameButtons(options) {
        const buttons = super._getFrameButtons(options);
        return storageInventoryOwner(this.document) ? buttons.filter(button => button.action !== "copyUuid") : buttons;
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        bindFieldEnter(this.element);
        const storage = storageInventoryOwner(this.document);
        if (storage?.document && !this._storageHooks.length) {
            this._storageHooks.push(["updateItem", Hooks.on("updateItem", item => {
                if (item.uuid !== storage.uuid) return;
                if (storage.items.has(this.document.id) && storageAccess(storage)) this.render({ force: false });
                else this.close();
            })], ["deleteItem", Hooks.on("deleteItem", item => { if (item.uuid === storage.uuid) this.close(); })]);
        }
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const { type, system } = this.document;
        const storage = storageInventoryOwner(this.document);
        const ground = storage && looseGroundItem(storage)?.id === this.document.id;
        const groundActions = ground ? groundMenu(storage).actions.map(([action, label, icon]) => ({ action, label, icon })) : [];
        return {
            ...context,
            groundActions, canGroundTransfer: ground && storageAccess(storage) && !this._groundBusy,
            system,
            isObject: type === "object",
            isPurse: type === "purse",
            canMovePurse: type === "purse" && this.isEditable && Boolean(this.document.actor ?? storageInventoryOwner(this.document)),
            isContainer: isInventoryContainer(this.document),
            coins: luqaCounters(this.document),
            isWeapon: type === "weapon",
            isShield: type === "shield",
            isProtection: type === "protection",
            hasReductions: type === "shield" || type === "protection",
            weaponProperties: type === "weapon" ? choices(WEAPON_PROPERTIES, system.properties) : [],
            ammunitionChoices: ammunitionItems(this.document.actor).map(item => ({ id: item.id, name: item.name,
                quantity: item.system.quantity, selected: item.id === system.ammunition?.itemId })),
            damageTypes: type === "weapon" ? [...system.damageTypes].join("\n") : "",
            protectionZones: type === "protection" ? choices(PROTECTION_ZONES, system.zones) : [],
            reductions: Object.entries(system.damageReductions ?? {}).map(([type, value]) => ({ type, value }))
        };
    }

    _processFormData(event, form, formData) {
        const data = super._processFormData(event, form, formData);
        const item = this.document;
        data.name = data.name.trim();
        if (!data.name) throw new Error("Donnez un nom à l’objet.");

        if (item.type === "weapon") {
            data.system.properties = selectedChoices(form, "data-weapon-property", WEAPON_PROPERTIES, item.system.properties);
            const types = form.querySelector("[data-weapon-damage-types]").value.split("\n");
            data.system.damageTypes = [...new Set(types.map(type => type.trim()).filter(Boolean))];
            data.system.guardEnabled = false; // Ancien indicateur remplacé par la propriété Garde.
        }
        if (item.type === "protection") {
            data.system.zones = selectedChoices(form, "data-protection-zone", PROTECTION_ZONES, item.system.zones);
        }
        if (item.type === "shield" || item.type === "protection") {
            const changes = reductionChanges(form, item.system.damageReductions);
            if (Object.keys(changes).length) data.system.damageReductions = changes;
        }
        return data;
    }

    async _processSubmitData(event, form, data, options) {
        const { id } = this.document;
        const actor = this.document.actor ?? storageInventoryOwner(this.document);
        if (!["character", "npc", "storage"].includes(actor?.type)) return super._processSubmitData(event, form, data, options);
        const updated = await actor.updateInventoryItem(id, data);
        if (!updated) throw new Error("L’objet n’a pas pu être enregistré.");
        return { updated };
    }

    static #onAddReduction(event, target) {
        if (!this.isEditable) return;
        const form = target.form;
        const row = form.querySelector("[data-reduction-template]").content.cloneNode(true);
        const type = row.querySelector("[data-reduction-type]");
        form.querySelector("[data-reduction-rows]").append(row);
        type.focus();
    }

    static #onRemoveReduction(event, target) {
        if (this.isEditable) target.closest("[data-reduction-row]").remove();
    }

    static async #onDelete() {
        if (!this.isEditable) return;
        const item = this.document;
        const owner = item.actor ?? storageInventoryOwner(item);
        const onCharacter = ["character", "npc", "storage"].includes(owner?.type);
        const name = foundry.utils.escapeHTML(item.name);
        const contents = isInventoryContainer(item) && onCharacter
            ? "<p>Les objets contenus seront déplacés vers le contenant parent ou à la racine de l’inventaire.</p>"
            : "";
        const coins = luqaCounters(item).some(({ value }) => value > 0)
            ? "<p>Les Luqa inscrits dans la bourse seront supprimés avec elle.</p>"
            : "";
        const confirmed = await formDialog.confirm({
            window: { title: "Supprimer de l’inventaire" },
            content: `<p>Supprimer « ${name} » ?</p>${contents}${coins}`,
            yes: { label: "Supprimer", default: false },
            no: { label: "Annuler", default: true },
            modal: true,
            rejectClose: false
        });
        if (!confirmed) return;

        try {
            const deleted = onCharacter
                ? await owner.deleteInventoryItem(item.id)
                : await item.delete();
            if (deleted && this.rendered) await this.close();
        } catch (error) {
            ui.notifications.error(error.message);
        }
    }
}
