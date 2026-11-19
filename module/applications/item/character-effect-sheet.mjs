import { openCharacterEffectsEditor } from "../character-effects-editor.mjs";

// The same editor is available for world Items and embedded Traits/Aptitudes.
export class CharacterEffectItemSheet extends foundry.applications.sheets.ItemSheetV2 {
    async render() {
        if (this._effectDialog?.rendered) {
            this._effectDialog.bringToFront();
            return this;
        }
        this._effectDialog = await openCharacterEffectsEditor(this.document, {
            actor: this.document.actor ?? { system: {}, items: [] }
        });
        return this;
    }

    async close(options) {
        await this._effectDialog?.close(options);
        return this;
    }
}
