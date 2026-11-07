const {
    NumberField,
    StringField
} = foundry.data.fields;

import { BaseItemData } from "./base-item-data.mjs";


export class SkillData extends BaseItemData {

    static defineSchema() {
        return {
            ...super.defineSchema(),

            ability: new StringField({
                required: true,
                nullable: false,
                blank: false,
                initial: "strength"
            }),

            mastery: new NumberField({
                required: true,
                nullable: false,
                integer: true,
                initial: 0
            })
        };
    }
}