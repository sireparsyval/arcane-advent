import { isInventoryContainer, luqaCounters } from "../../inventory.mjs";
import { WEAPON_PROPERTIES } from "../../expertise.mjs";

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
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
        actions: {
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

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const { type, system } = this.document;
        return {
            ...context,
            system,
            isObject: type === "object",
            isPurse: type === "purse",
            isContainer: isInventoryContainer(this.document),
            coins: luqaCounters(this.document),
            isWeapon: type === "weapon",
            isShield: type === "shield",
            isProtection: type === "protection",
            hasReductions: type === "shield" || type === "protection",
            weaponProperties: type === "weapon" ? choices(WEAPON_PROPERTIES, system.properties) : [],
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
            if (!data.system.properties.includes("twoHanded")) data.system.guardEnabled = false;
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
        const { actor, id } = this.document;
        if (actor?.type !== "character") return super._processSubmitData(event, form, data, options);
        const updated = await actor.updateInventoryItem(id, data);
        return updated ? { updated } : {};
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
        const onCharacter = item.actor?.type === "character";
        const name = foundry.utils.escapeHTML(item.name);
        const contents = isInventoryContainer(item) && onCharacter
            ? "<p>Les objets contenus seront déplacés vers le contenant parent ou à la racine de l’inventaire.</p>"
            : "";
        const coins = luqaCounters(item).some(({ value }) => value > 0)
            ? "<p>Les Luqa inscrits dans la bourse seront supprimés avec elle.</p>"
            : "";
        const confirmed = await DialogV2.confirm({
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
                ? await item.actor.deleteInventoryItem(item.id)
                : await item.delete();
            if (deleted && this.rendered) await this.close();
        } catch (error) {
            ui.notifications.error(error.message);
        }
    }
}
