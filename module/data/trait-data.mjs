import { BaseItemData } from "./base-item-data.mjs";

const { StringField } = foundry.data.fields;

// Les Traits décrivent les particularités et exceptions aux règles.
// Les capacités suivant les règles standard restent des Aptitudes.
export class TraitData extends BaseItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            requirements: new StringField({
                required: true,
                nullable: false,
                blank: true,
                initial: ""
            })
        };
    }
}
