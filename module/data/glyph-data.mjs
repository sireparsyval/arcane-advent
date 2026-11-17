import { BaseItemData } from "./base-item-data.mjs";
import { isGlyphId } from "../glyphs.mjs";

const { StringField } = foundry.data.fields;
const text = () => new StringField({ required: true, nullable: false, blank: true, trim: false, initial: "" });

export class GlyphData extends BaseItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            glyphId: new StringField({
                required: true, nullable: false, blank: false, initial: "G000", validate: isGlyphId
            }),
            meaning: text(),
            pronunciation: text(),
            somatic: text(),
            category: text()
        };
    }
}
