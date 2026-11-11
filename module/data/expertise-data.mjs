const {
    NumberField,
    StringField,
    SetField,
    TypedObjectField
} = foundry.data.fields;

import { BaseItemData } from "./base-item-data.mjs";
import { PROPERTY_FILTER_STATES } from "../expertise.mjs";


export class ExpertiseData extends BaseItemData {

    static defineSchema() {
        return {
            ...super.defineSchema(),

            domain: new StringField({
                required: true,
                nullable: false,
                blank: false,
                initial: "weaponClass"
            }),

            target: new StringField({
                required: true,
                nullable: false,
                blank: true,
                initial: ""
            }),

            // Plusieurs classes possibles. "target" est conservé pour les anciennes fiches.
            classes: new SetField(new StringField({ required: true, blank: false }), {
                required: true, nullable: false, initial: []
            }),

            propertyFilters: new TypedObjectField(new StringField({
                required: true, nullable: false,
                choices: Object.keys(PROPERTY_FILTER_STATES), initial: "neutral"
            }), { required: true, nullable: false, initial: {} }),

            bonus: new NumberField({
                required: true,
                nullable: false,
                integer: true,
                initial: 0
            })
        };
    }
}