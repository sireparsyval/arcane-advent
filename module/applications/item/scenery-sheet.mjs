const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class SceneryElementSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ["arcane-advent", "aa-scenery-sheet"],
        position: { width: 560, height: "auto" }
    };

    static PARTS = {
        editor: { template: "systems/arcane-advent/templates/item/scenery-sheet.hbs" }
    };

    async _prepareContext(options) {
        return {
            ...await super._prepareContext(options),
            system: this.document.system,
            isInteractive: this.document.type === "interactiveElement"
        };
    }

    _processFormData(event, form, formData) {
        const data = super._processFormData(event, form, formData);
        data.name = data.name.trim();
        if (!data.name) throw new Error("Donnez un nom à cet élément.");
        return data;
    }
}
