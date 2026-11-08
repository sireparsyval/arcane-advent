const {
    BooleanField,
    NumberField,
    StringField
} = foundry.data.fields;

import { EquipmentData } from "./equipment-data.mjs";


export class ShieldData extends EquipmentData {

    static defineSchema() {
        return {
            ...super.defineSchema(),

            shieldClass: new StringField({
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

            guardEnabled: new BooleanField({
                required: true,
                nullable: false,
                initial: false
            })
        };
    }
}