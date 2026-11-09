const {
    BooleanField,
    NumberField,
    SetField,
    StringField,
    TypedObjectField
} = foundry.data.fields;

import { BaseItemData } from "./base-item-data.mjs";


export function damageReductionsField() {
    return new TypedObjectField(
        new NumberField({
            required: true,
            nullable: false,
            integer: true,
            min: 0,
            initial: 0
        }),
        { required: true, nullable: false, initial: {} }
    );
}

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