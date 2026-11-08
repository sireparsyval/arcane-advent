const {
    NumberField,
    StringField
} = foundry.data.fields;

import { BaseItemData } from "./base-item-data.mjs";


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

            bonus: new NumberField({
                required: true,
                nullable: false,
                integer: true,
                initial: 0
            })
        };
    }
}