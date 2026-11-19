import { BaseItemData } from "./base-item-data.mjs";
import { effectFields } from "./effect-fields.mjs";

const { StringField } = foundry.data.fields;

// Les Traits décrivent les particularités et exceptions aux règles.
// Les capacités suivant les règles standard restent des Aptitudes.
export class TraitData extends BaseItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            ...effectFields(),
            requirements: new StringField({
                required: true,
                nullable: false,
                blank: true,
                initial: ""
            })
        };
    }
}
