const {
    NumberField,
    SetField,
    StringField,
    TypedObjectField
} = foundry.data.fields;

import { EquipmentData } from "./equipment-data.mjs";


export class ProtectionData extends EquipmentData {

    static defineSchema() {
        return {
            ...super.defineSchema(),

            armorClass: new StringField({
                required: true,
                nullable: false,
                blank: true,
                initial: ""
            }),

            defenseBonus: new NumberField({
                required: true,
                nullable: false,
                integer: true,
                initial: 0
            }),

            zones: new SetField(
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
            ),

            damageReductions: new TypedObjectField(
                new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 0
                }),
                {
                    required: true,
                    nullable: false,
                    initial: {}
                }
            )
        };
    }
}