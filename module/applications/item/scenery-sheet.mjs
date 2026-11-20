import { placeSceneObject } from "../../scene-objects.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class SceneryElementSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ["arcane-advent", "aa-scenery-sheet"],
        position: { width: 610, height: 720 },
        window: { resizable: true },
        actions: { placeSceneObject: this.onPlaceSceneObject }
    };

    static PARTS = {
        editor: { template: "systems/arcane-advent/templates/item/scenery-sheet.hbs", scrollable: [""] }
    };

    async _prepareContext(options) {
        const animations = [{ key: "", label: "Aucune" }, ...Object.entries(CONFIG.Canvas.lightAnimations)
            .map(([key, animation]) => ({ key, label: game.i18n.localize(animation.label) }))];
        return {
            ...await super._prepareContext(options), system: this.document.system,
            isInteractive: this.document.type === "interactiveElement",
            isVisual: this.document.type === "visualEffect",
            typeLabel: game.i18n.localize("TYPES.Item." + this.document.type),
            animations, canPlace: game.user.isGM && Boolean(canvas.scene)
        };
    }

    _processFormData(event, form, formData) {
        const data = super._processFormData(event, form, formData);
        data.name = data.name.trim();
        if (!data.name) throw new Error("Donnez un nom à cet élément.");
        const color = data.system?.light?.color;
        if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Utilisez une couleur au format #RRGGBB.");
        return data;
    }

    static async onPlaceSceneObject() {
        if (!this.isEditable || !game.user.isGM) return;
        try {
            await this.submit();
            await placeSceneObject(this.document, canvas.scene);
        } catch (error) { ui.notifications.error(error.message); }
    }
}
