import { BaseItemData } from "./base-item-data.mjs";

const { BooleanField, NumberField, SchemaField, SetField, StringField, TypedObjectField } = foundry.data.fields;

export const APTITUDE_CATEGORIES = Object.freeze({
    technique: "Technique",
    spell: "Sort",
    hybrid: "Hybride",
    passive: "Passif"
});

export const APTITUDE_OPTIONS = Object.freeze({
    duration: "Durée",
    recovery: "Récupération",
    charge: "Charges",
    casting: "Incantation"
});

export const APTITUDE_DURATION_UNITS = Object.freeze({
    turns: "Tours",
    minutes: "Minutes",
    hours: "Heures",
    days: "Jours",
    rests: "Repos"
});

export const APTITUDE_RECOVERY_UNITS = Object.freeze({
    ...APTITUDE_DURATION_UNITS,
    longRest: "Repos long",
    shortRest: "Repos court"
});

function countField(initial = 0) {
    return new NumberField({ required: true, nullable: false, integer: true, min: 0, initial });
}

function timeUnit(suffix) {
    if (suffix?.startsWith("h")) return "hours";
    if (suffix?.startsWith("j")) return "days";
    return "turns";
}

export function parseLegacyAptitudeOption(key, text) {
    text = text.trim();
    if (key === "duration") {
        const match = /^(\d+)\s*(t(?:ours?)?|h(?:eures?)?|j(?:ours?)?)?$/iu.exec(text);
        const count = Number(match?.[1]);
        return Number.isSafeInteger(count) ? { count, unit: timeUnit(match[2]?.toLowerCase()) } : null;
    }

    let unit = "turns";
    if (key === "recovery") {
        const suffix = /(?:repos\s+(longs?|courts?)|t(?:ours?)?|h(?:eures?)?|j(?:ours?)?)$/iu.exec(text);
        if (suffix) {
            const rest = suffix[1]?.toLowerCase();
            if (rest) unit = rest.startsWith("long") ? "longRest" : "shortRest";
            else unit = timeUnit(suffix[0].toLowerCase());
            text = text.slice(0, suffix.index).trim()
                .replace(/^(?:apr[eè]s\s+)?un$/iu, "") || "1";
        }
    } else {
        text = text.replace(/\s+(?:utilisations?(?: restantes?)?|points?(?: de charge)?|charges?)\b/giu, "");
    }

    const match = /^(\d+)(?:\s*(?:\/|sur)\s*(\d+))?$/iu.exec(text);
    if (!match) return null;

    const max = Number(match[2] ?? match[1]);
    const remaining = key === "recovery" && match[2] === undefined ? 0 : Number(match[1]);
    if (!Number.isSafeInteger(max) || !Number.isSafeInteger(remaining) || remaining > max) return null;

    return key === "recovery" ? { remaining, max, unit } : { remaining, max };
}

export class AptitudeData extends BaseItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            category: new StringField({
                required: true,
                nullable: false,
                choices: Object.keys(APTITUDE_CATEGORIES),
                initial: "technique"
            }),
            level: countField(1),
            // Une aptitude peut être créée depuis les options d'un Trait.
            traitId: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
            requirements: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
            // Les anciennes chaînes restent disponibles pour les fiches enregistrées avant les compteurs.
            duration: new StringField({ blank: true, initial: "" }),
            recovery: new StringField({ blank: true, initial: "" }),
            charge: new StringField({ blank: true, initial: "" }),
            durationTurns: countField(),
            durationUnit: new StringField({
                required: true,
                nullable: false,
                choices: Object.keys(APTITUDE_DURATION_UNITS),
                initial: "turns"
            }),
            recoveryCounter: new SchemaField({
                remaining: countField(),
                max: countField(),
                unit: new StringField({
                    required: true,
                    nullable: false,
                    choices: Object.keys(APTITUDE_RECOVERY_UNITS),
                    initial: "turns"
                })
            }),
            chargeCounter: new SchemaField({
                remaining: countField(),
                max: countField()
            }),
            castingCounter: new SchemaField({
                remaining: countField(),
                max: countField(),
                unit: new StringField({ choices: Object.keys(APTITUDE_RECOVERY_UNITS), initial: "turns" })
            }),
            // La durée en cours d'un effet n'est pas son temps d'incantation.
            effectDuration: new SchemaField({
                enabled: new BooleanField({ initial: false }),
                remaining: countField(),
                unit: new StringField({ choices: Object.keys(APTITUDE_RECOVERY_UNITS), initial: "turns" })
            }),
            targeting: new SchemaField({
                mode: new StringField({ choices: ["self", "single", "multiple", "area"], initial: "single" }),
                maxTargets: countField(1),
                shape: new StringField({ choices: ["circle", "cone", "line", "rectangle", "free"], initial: "circle" }),
                range: new NumberField({ min: 0, initial: 0 }),
                radius: new NumberField({ min: 0, initial: 0 }),
                length: new NumberField({ min: 0, initial: 0 }),
                width: new NumberField({ min: 0, initial: 0 }),
                angle: new NumberField({ min: 0, max: 360, initial: 90 }),
                origin: new StringField({ choices: ["caster", "target"], initial: "caster" }),
                propagation: new StringField({ choices: ["projectile", "beam", "instant", "wave"], initial: "instant" }),
                travels: new BooleanField({ initial: false })
            }),
            conditions: new TypedObjectField(new SchemaField({
                label: new StringField({ blank: false, initial: "Condition" }),
                kind: new StringField({ choices: ["manual", "automatic"], initial: "manual" }),
                enabled: new BooleanField({ initial: false }),
                metric: new StringField({ choices: ["pdcRatio", "pdfRatio", "ability", "alteration", "equipped", "expertise", "inventory", "luqa", "formula"], initial: "pdcRatio" }),
                operator: new StringField({ choices: ["<", "<=", "=", ">=", ">", "!="], initial: "<" }),
                value: new NumberField({ initial: 50 }),
                key: new StringField({ blank: true, initial: "" }),
                expression: new StringField({ blank: true, initial: "" })
            }), { required: true, nullable: false, initial: {} }),
            rolls: new TypedObjectField(new SchemaField({
                name: new StringField({ blank: false, initial: "Jet" }),
                formula: new StringField({ blank: false, initial: "1d20" }),
                ability: new StringField({ blank: true, initial: "" }),
                abilities: new SetField(new StringField({ required: true, blank: false }), {
                    required: true, nullable: false, initial: []
                }),
                skillId: new StringField({ blank: true, initial: "" }),
                expertiseId: new StringField({ blank: true, initial: "" })
            }), { required: true, nullable: false, initial: {} }),
            showOptions: new SchemaField(Object.fromEntries(
                Object.keys(APTITUDE_OPTIONS).map(key => [
                    key, new BooleanField({ nullable: true, initial: null })
                ])
            ))
        };
    }

    static migrateData(source, options) {
        for (const key of ["duration", "recovery", "charge"]) {
            if (typeof source[key] !== "string") continue;
            const value = parseLegacyAptitudeOption(key, source[key]);
            if (value === null) continue;

            if (key === "duration") {
                source.durationTurns ??= value.count;
                source.durationUnit ??= value.unit;
            } else {
                const counter = `${key}Counter`;
                source[counter] = { ...value, ...source[counter] };
            }
        }

        return super.migrateData(source, options);
    }

    static validateJoint(data) {
        super.validateJoint(data);
        for (const key of ["recovery", "charge", "casting"]) {
            const { remaining, max } = data[`${key}Counter`];
            if (remaining > max) {
                throw new Error(`${APTITUDE_OPTIONS[key]} — la valeur restante dépasse le maximum.`);
            }
        }
    }
}
