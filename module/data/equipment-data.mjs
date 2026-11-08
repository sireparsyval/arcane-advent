const {
    BooleanField,
    SetField,
    StringField
} = foundry.data.fields;

import { BaseItemData } from "./base-item-data.mjs";


export class EquipmentData extends BaseItemData {

    static defineSchema() {
        return {
            ...super.defineSchema(),

            equipped: new BooleanField({
                required: true,
                nullable: false,
                initial: false
            }),

            properties: new SetField(
                new StringField({
                    required: true,
                    nullable: false,
                    blank: false
                }),
                {
                    required: true,
                    nullable: false,
                    initial: []
                }
            )
        };
    }
}