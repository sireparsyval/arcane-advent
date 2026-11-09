import { BaseItemData } from "./base-item-data.mjs";

const { NumberField, StringField } = foundry.data.fields;

export const INJURY_ZONES = Object.freeze({
    "": "Générale / non précisée",
    head: "Tête",
    torso: "Torse",
    arms: "Bras",
    legs: "Jambes"
});

export class AlterationData extends BaseItemData {

    static defineSchema() {
        return {
            ...super.defineSchema(),
            severity: new NumberField({
                required: true,
                nullable: false,
                integer: true,
                min: 0,
                initial: 1
            })
        };
    }
}

export class InjuryData extends AlterationData {

    static defineSchema() {
        return {
            ...super.defineSchema(),
            zone: new StringField({
                required: true,
                blank: true,
                choices: Object.keys(INJURY_ZONES),
                initial: ""
            })
        };
    }
}
