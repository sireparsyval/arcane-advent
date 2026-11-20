import { EFFECT_STAT_TARGETS, EFFECT_ROLL_SCOPES, EFFECT_ACTIVATIONS, EFFECT_ABILITIES } from "../character-effects.mjs";
import { CONDITION_METRICS } from "../aptitude-conditions.mjs";

export function conditionsField() {
    const { BooleanField, NumberField, SchemaField, StringField, TypedObjectField } = foundry.data.fields;
    return new TypedObjectField(new SchemaField({
        label: new StringField({ blank: true, initial: "" }),
        kind: new StringField({ choices: ["manual", "automatic"], initial: "manual" }),
        enabled: new BooleanField({ initial: false }),
        metric: new StringField({ choices: Object.keys(CONDITION_METRICS), initial: "pdcRatio" }),
        operator: new StringField({ choices: ["<", "<=", "=", ">=", ">", "!="], initial: "<" }),
        value: new NumberField({ initial: 50 }),
        key: new StringField({ blank: true, initial: "" }),
        expression: new StringField({ blank: true, initial: "" }),
        consumes: new BooleanField({ initial: false })
    }), { required: true, nullable: false, initial: {} });
}

export function effectFields({ aptitude = false, withConditions = true } = {}) {
    const { ArrayField, BooleanField, NumberField, SchemaField, StringField, TypedObjectField } = foundry.data.fields;
    return {
        effectActivation: new SchemaField({
            enabled: new BooleanField({ initial: true }),
            mode: new StringField({ choices: Object.keys(EFFECT_ACTIVATIONS), initial: aptitude ? "passive" : "always" }),
            active: new BooleanField({ initial: false })
        }),
        conditionMatch: new StringField({ choices: ["all", "any"], initial: "all" }),
        ...(withConditions ? { conditions: conditionsField() } : {}),
        effectRules: new TypedObjectField(new SchemaField({
            label: new StringField({ blank: true, initial: "" }),
            enabled: new BooleanField({ initial: true }),
            kind: new StringField({ choices: ["stat", "roll"], initial: "stat" }),
            target: new StringField({ choices: Object.keys(EFFECT_STAT_TARGETS), initial: "strength" }),
            amount: new NumberField({ initial: 0 }),
            coefficient: new NumberField({ min: 0, initial: 1 }),
            addBefore: new BooleanField({ initial: false }),
            scope: new StringField({ choices: Object.keys(EFFECT_ROLL_SCOPES), initial: "all" }),
            ability: new StringField({ choices: ["", ...Object.keys(EFFECT_ABILITIES)], blank: true, initial: "" }),
            skill: new StringField({ blank: true, initial: "" }),
            advantage: new BooleanField({ initial: false }),
            disadvantage: new BooleanField({ initial: false }),
            conditionMode: new StringField({ choices: ["source", "selected"], initial: "source" }),
            conditionIds: new ArrayField(new StringField({ blank: false }), { initial: [] }),
            conditionMatch: new StringField({ choices: ["all", "any"], initial: "all" })
        }), { required: true, nullable: false, initial: {} })
    };
}
