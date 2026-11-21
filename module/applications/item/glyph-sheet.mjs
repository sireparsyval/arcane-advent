import { glyphDisplay, isGlyphId, normalizeGlyphId } from "../../glyphs.mjs";
import { glyphReferenceName, requireGlyphGM, showGlyphInChat } from "../../glyph-catalog.mjs";
import { bindFieldEnter } from "../form-interactions.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class GlyphSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ["arcane-advent", "aa-glyph-sheet"],
        position: { width: 560, height: "auto" },
        form: { submitOnChange: false, closeOnSubmit: true },
        actions: { showGlyph: this._showGlyph }
    };

    static PARTS = {
        editor: { template: "systems/arcane-advent/templates/item/glyph-sheet.hbs" }
    };

    async _onRender(context, options) {
        await super._onRender(context, options);
        bindFieldEnter(this.element);
    }

    _canRender(options) {
        requireGlyphGM();
        return super._canRender(options);
    }

    async _prepareContext(options) {
        return {
            ...await super._prepareContext(options),
            system: this.document.system,
            symbol: glyphDisplay(this.document.system.glyphId),
            canEdit: this.isEditable
        };
    }

    _processFormData(event, form, formData) {
        requireGlyphGM();
        const data = super._processFormData(event, form, formData);
        data.system.glyphId = normalizeGlyphId(data.system.glyphId);
        if (!isGlyphId(data.system.glyphId)) throw new Error("Saisissez un identifiant comme G019.");
        data.name = glyphReferenceName(data.system);
        return data;
    }

    async _processSubmitData(event, form, submitData, options) {
        requireGlyphGM();
        const pack = game.packs.get(this.document.pack);
        if (pack) {
            const entries = await pack.getDocuments({ type: "glyph" });
            if (entries.some(entry => entry.id !== this.document.id && entry.system.glyphId === submitData.system.glyphId)) {
                throw new Error("Cet ID possède déjà une référence dans ce compendium.");
            }
        }
        return super._processSubmitData(event, form, submitData, options);
    }

    static async _showGlyph() {
        return showGlyphInChat(this.document.system.glyphId);
    }
}
