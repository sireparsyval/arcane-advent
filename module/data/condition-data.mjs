import { BaseItemData } from "./base-item-data.mjs";

const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

export const ALTERATION_DURATION_UNITS = Object.freeze({
    turns: "tours", minutes: "minutes", hours: "heures", days: "jours"
});

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
            }),
            duration: new SchemaField({
                enabled: new BooleanField({ required: true, nullable: false, initial: false }),
                remaining: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
                unit: new StringField({ required: true, nullable: false,
                    choices: Object.keys(ALTERATION_DURATION_UNITS), initial: "turns" })
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
