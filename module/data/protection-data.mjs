const {
    NumberField,
    SetField,
    StringField
} = foundry.data.fields;

import { EquipmentData, damageReductionsField } from "./equipment-data.mjs";


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

            damageReductions: damageReductionsField()
        };
    }
}