import { BaseItemData } from "./base-item-data.mjs";
import { modifierSchema } from "../modifiers.mjs";

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

class ConditionData extends BaseItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            // La gravité/intensité n'est plus un indice : chaque effet agit directement.
            modifiers: modifierSchema()
        };
    }
}

export class AlterationData extends ConditionData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            duration: new SchemaField({
                enabled: new BooleanField({ required: true, nullable: false, initial: false }),
                remaining: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
                unit: new StringField({ required: true, nullable: false,
                    choices: Object.keys(ALTERATION_DURATION_UNITS), initial: "turns" })
            })
        };
    }
}

export class InjuryData extends ConditionData {
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
