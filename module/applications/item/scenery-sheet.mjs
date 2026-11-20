import { placeSceneObject } from "../../scene-objects.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

function animationsFor(negative) {
    const choices = negative ? CONFIG.Canvas.darknessAnimations : CONFIG.Canvas.lightAnimations;
    return [{ key: "", label: "Aucune" }, ...Object.entries(choices ?? {})
        .map(([key, animation]) => ({ key, label: game.i18n.localize(animation.label) }))];
}

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
        const animations = animationsFor(this.document.system.light.negative);
        return {
            ...await super._prepareContext(options), system: this.document.system,
            isInteractive: this.document.type === "interactiveElement",
            isVisual: this.document.type === "visualEffect",
            typeLabel: game.i18n.localize("TYPES.Item." + this.document.type),
            animations, canPlace: game.user.isGM && Boolean(canvas.scene)
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const negative = this.element.querySelector('[name="system.light.negative"]');
        negative?.addEventListener("change", () => {
            const select = this.element.querySelector('[name="system.light.animation"]');
            const previous = select.value;
            const choices = animationsFor(negative.checked);
            select.replaceChildren(...choices.map(({ key, label }) => new Option(label, key)));
            select.value = choices.some(choice => choice.key === previous) ? previous : "";
        });
    }

    _processFormData(event, form, formData) {
        const data = super._processFormData(event, form, formData);
        data.name = data.name.trim();
        if (!data.name) throw new Error("Donnez un nom à cet élément.");
        for (const color of [data.system?.light?.color, data.system?.mist?.color]) {
            if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Utilisez une couleur au format #RRGGBB.");
        }
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
