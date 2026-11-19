import { ARCANE_NEEDS } from "../config.mjs";
import { arcanologyField } from "./arcanology-data.mjs";
import { buildInventory } from "../inventory.mjs";
import { VOLUME_FACTORS, carryingCapacity, calculateEncumbrance, encumberedSpeed } from "../encumbrance.mjs";
import { modifierSchema, modifierTotals as collectModifierTotals, ABILITY_MODIFIER_KEYS, abilityScoreModifier } from "../modifiers.mjs";
import { effectFields } from "./effect-fields.mjs";
import { activeCharacterEffects, applyStatisticEffects } from "../character-effects.mjs";

const {
    NumberField, BooleanField, ObjectField,
    SchemaField,
    StringField
} = foundry.data.fields;


function descriptiveField(initial = "") {
    return new StringField({ required: true, nullable: false, blank: true, initial });
}

function identityField() {
    return new SchemaField({
        title: descriptiveField(),
        ethnicity: descriptiveField(),
        gender: new StringField({ required: true, nullable: false,
            choices: ["masculine", "feminine", "unknown"], initial: "unknown" }),
        volume: new StringField({ required: true, nullable: false,
            choices: Object.keys(VOLUME_FACTORS), initial: "medium" }),
        ageMode: new StringField({ required: true, nullable: false,
            choices: ["estimated", "number"], initial: "estimated" }),
        ageNumber: new NumberField({ required: true, nullable: false,
            integer: true, min: 0, initial: 0 }),
        ageEstimate: new StringField({ required: true, nullable: false,
            choices: ["unknown", "infant", "child", "adolescent", "youngAdult", "adult", "elderly", "venerable"],
            initial: "unknown" }),
        heightMeters: new NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
        // Poids corporel seulement, jamais additionné à l'inventaire.
        bodyWeightKg: new NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
        alignment: descriptiveField("Neutre")
    });
}

function biographyField() {
    return new SchemaField({
        feature: descriptiveField(),
        motivation: descriptiveField(),
        habit: descriptiveField(),
        family: descriptiveField(),
        raisedBy: descriptiveField(),
        quest: descriptiveField(),
        personality: descriptiveField(),
        ideals: descriptiveField(),
        bonds: descriptiveField(),
        flaws: descriptiveField()
    });
}

function abilityField() {
    return new SchemaField({
        value: new NumberField({
            required: true,
            nullable: false,
            integer: true,
            initial: 10
        }),

        modifier: new NumberField({
            required: true,
            nullable: false,
            integer: true,
            initial: 0,
            persisted: false
        }),
        effective: new NumberField({
            required: true,
            nullable: false,
            integer: true,
            initial: 10,
            persisted: false
        })
    });
}


function savingThrowField() {
    return new SchemaField({
        mastery: new NumberField({
            required: true,
            nullable: false,
            integer: true,
            initial: 0
        }),

        total: new NumberField({
            required: true,
            nullable: false,
            integer: true,
            initial: 0,
            persisted: false
        })
    });
}


export class CharacterData extends foundry.abstract.TypeDataModel {

    static defineSchema() {
        return {
            ...effectFields(),
            effectSnapshot: new ObjectField({ initial: {}, persisted: false }),
            arcanology: arcanologyField(),
            identity: identityField(),
            biography: biographyField(),
            // Ajustement manuel facultatif de la charge max., en kg.
            carryingCapacityBonusKg: new NumberField({
                required: true, nullable: false, initial: 0
            }),
            carryingCapacityCoefficient: new NumberField({ required: true, nullable: false, min: 0, initial: 1 }),
            carryingCapacityAddBefore: new BooleanField({ initial: false }),
            encumbrance: new SchemaField({
                carried: new NumberField({ required: true, nullable: false, min: 0, initial: 0, persisted: false }),
                maximum: new NumberField({ required: true, nullable: false, min: 0, initial: 0, persisted: false }),
                percentage: new NumberField({ required: true, nullable: false, min: 0, initial: 0, persisted: false }),
                stage: new StringField({ required: true, nullable: false,
                    choices: ["free", "encumbered", "overloaded", "immobilized"],
                    initial: "free", persisted: false })
            }, { persisted: false }),
            // Ajustements manuels indépendants des altérations et blessures.
            manualModifiers: modifierSchema(),
            // Somme non persistée des modifications de toutes les sources.
            modifierTotals: modifierSchema({ persisted: false }),
            abilities: new SchemaField({
                strength: abilityField(),
                dexterity: abilityField(),
                constitution: abilityField(),
                intelligence: abilityField(),
                wisdom: abilityField(),
                charisma: abilityField()
            }),

            savingThrows: new SchemaField({
                strength: savingThrowField(),
                dexterity: savingThrowField(),
                constitution: savingThrowField(),
                intelligence: savingThrowField(),
                wisdom: savingThrowField(),
                charisma: savingThrowField()
            }),

            rollMode: new StringField({
                required: true,
                nullable: false,
                blank: false,
                choices: ["normal", "advantage", "disadvantage"],
                initial: "normal"
            }),

            consciousness: new SchemaField({
                effectiveMax: new NumberField({ min: 0, integer: true, initial: 0, persisted: false }),
                value: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 0
                }),

                max: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 0
                }),

                percentage: new NumberField({
                    required: true,
                    nullable: false,
                    min: 0,
                    max: 100,
                    initial: 0,
                    persisted: false
                })
            }),

            fever: new SchemaField({
                effectiveMax: new NumberField({ min: 0, integer: true, initial: 0, persisted: false }),
                value: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 0
                }),

                max: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 0
                }),

                percentage: new NumberField({
                    required: true,
                    nullable: false,
                    min: 0,
                    max: 100,
                    initial: 0,
                    persisted: false
                })
            }),

            consciousnessDice: new SchemaField({
                effectiveMax: new NumberField({ min: 0, integer: true, initial: 0, persisted: false }),

                value: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 0
                }),

                max: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 0
                }),

                formula: new StringField({
                    required: true,
                    nullable: false,
                    blank: true,
                    initial: "1d8"
                })
            }),


            barrier: new NumberField({
                required: true,
                nullable: false,
                integer: true,
                min: 0,
                initial: 0
            }),


            deathSaves: new SchemaField({

                successes: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    max: 3,
                    initial: 0
                }),

                failures: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    max: 3,
                    initial: 0
                })
            }),


            mercy: new NumberField({
                required: true,
                nullable: false,
                integer: true,
                min: 0,
                initial: 0
            }),

            defense: new SchemaField({

                mode: new StringField({
                    required: true,
                    nullable: false,
                    blank: false,
                    initial: "dex"
                }),

                base: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    initial: 10,
                    persisted: false
                }),

                abilityModifier: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    initial: 0,
                    persisted: false
                }),

                abilityLabel: new StringField({
                    required: true,
                    nullable: false,
                    blank: true,
                    initial: "",
                    persisted: false
                }),

                shieldBonus: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    initial: 0,
                    persisted: false
                }),

                zones: new SchemaField({

                    head: new NumberField({
                        required: true,
                        nullable: false,
                        integer: true,
                        initial: 10,
                        persisted: false
                    }),

                    torso: new NumberField({
                        required: true,
                        nullable: false,
                        integer: true,
                        initial: 10,
                        persisted: false
                    }),

                    arms: new NumberField({
                        required: true,
                        nullable: false,
                        integer: true,
                        initial: 10,
                        persisted: false
                    }),

                    legs: new NumberField({
                        required: true,
                        nullable: false,
                        integer: true,
                        initial: 10,
                        persisted: false
                    })
                })
            }),

            trackers: new SchemaField({
                passivePerception: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    initial: 10,
                    persisted: false
                }),

                initiative: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    initial: 0,
                    persisted: false
                }),

                speed: new NumberField({
                    required: true,
                    nullable: false,
                    min: 0,
                    initial: 0
                }),
                effectiveSpeed: new NumberField({
                    required: true,
                    nullable: false,
                    min: 0,
                    initial: 0,
                    persisted: false
                })
            }),
        };
    }


    prepareDerivedData() {
        super.prepareDerivedData();
        const totals = collectModifierTotals(this.manualModifiers, this.parent?.items);
        this._prepareCoreStatistics(totals, []);
        // A stable snapshot prevents a conditional bonus from enabling itself or
        // oscillating every time Foundry prepares the actor.
        this.effectSnapshot = Object.fromEntries([
            "abilities", "savingThrows", "consciousness", "fever", "consciousnessDice",
            "deathSaves", "barrier", "mercy", "defense", "trackers", "encumbrance", "identity"
        ].map(key => [key, JSON.parse(JSON.stringify(this[key]))]));
        this._prepareCoreStatistics(totals, activeCharacterEffects(this.parent));
    }

    _prepareCoreStatistics(totals, rules) {
        const stat = (base, key, options) => applyStatisticEffects(base, key, rules, options);
        for (const key of Object.keys(totals)) this.modifierTotals[key] = totals[key];

        for (const key of ABILITY_MODIFIER_KEYS) {
            const ability = this.abilities[key];
            ability.effective = stat(ability.value + totals[key], key);
            ability.modifier = abilityScoreModifier(ability.effective);
            this.modifierTotals[key] = ability.effective - ability.value;
        }

        const dex =
            this.abilities.dexterity.modifier;

        const con =
            this.abilities.constitution.modifier;


        switch (this.defense.mode) {

            case "con":
                this.defense.abilityModifier = con;
                this.defense.abilityLabel = "CON";
                break;


            case "best":

                if (dex > con) {
                    this.defense.abilityModifier = dex;
                    this.defense.abilityLabel = "DEX";
                }

                else if (con > dex) {
                    this.defense.abilityModifier = con;
                    this.defense.abilityLabel = "CON";
                }

                else {
                    this.defense.abilityModifier = dex;
                    this.defense.abilityLabel = "DEX / CON";
                }

                break;


            case "dex":
            default:
                this.defense.abilityModifier = dex;
                this.defense.abilityLabel = "DEX";
                break;
        }


        this.defense.shieldBonus =
            this.parent.items
                .filter(item =>
                    item.type === "shield"
                    && item.system.equipped
                )
                .reduce(
                    (total, shield) =>
                        total
                        + shield.system.defenseBonus
                        + this.parent.getExpertiseBonus("shieldClass", shield.system.shieldClass),
                    0
                );


        this.defense.base = stat(
            10
            + this.defense.abilityModifier
            + this.defense.shieldBonus
            + totals.defense, "defense");
        this.modifierTotals.defense = this.defense.base - 10 - this.defense.abilityModifier - this.defense.shieldBonus;


        const protectionBonuses = {
            head: 0,
            torso: 0,
            arms: 0,
            legs: 0
        };


        for (const item of this.parent.items) {

            if (
                item.type !== "protection"
                || !item.system.equipped
            ) {
                continue;
            }


            const defenseBonus = item.system.defenseBonus
                + this.parent.getExpertiseBonus("armorClass", item.system.armorClass);

            for (const zone of item.system.zones) {

                if (!(zone in protectionBonuses)) {
                    continue;
                }


                protectionBonuses[zone] += defenseBonus;
            }
        }

        for (const zone of ["head", "torso", "arms", "legs"]) {
            const key = "defense" + zone[0].toUpperCase() + zone.slice(1);
            this.defense.zones[zone] = stat(this.defense.base + protectionBonuses[zone] + (totals[key] || 0), key);
            this.modifierTotals[key] = this.defense.zones[zone] - this.defense.base - protectionBonuses[zone];
        }

        const hasPerceptionSkill =
            this.parent.items.some(item =>
                item.type === "skill"
                && item.name.trim().toLowerCase() === "perception"
                && item.system.ability === "wisdom"
            );


        this.trackers.passivePerception = stat(
            10
            + this.abilities.wisdom.modifier
            + (hasPerceptionSkill ? 5 : 0)
            + totals.passivePerception, "passivePerception");

        this.trackers.initiative =
            stat(this.abilities.dexterity.modifier + totals.initiative, "initiative");
        this.modifierTotals.passivePerception = this.trackers.passivePerception - 10 - this.abilities.wisdom.modifier - (hasPerceptionSkill ? 5 : 0);
        this.modifierTotals.initiative = this.trackers.initiative - this.abilities.dexterity.modifier;

        // Une charge inclut les objets, pièces et équipements portés, jamais le corps.
        // La Force effective (après bonus/malus) détermine la capacité.
        const currentLoad = buildInventory(this.parent?.items ?? []).totalWeight;
        const capacity = applyStatisticEffects(carryingCapacity(this.abilities.strength.effective, this.identity.volume),
            "carryingCapacity", [{ kind: "stat", target: "carryingCapacity", amount: this.carryingCapacityBonusKg,
                coefficient: this.carryingCapacityCoefficient ?? 1, addBefore: this.carryingCapacityAddBefore }, ...rules],
            { integer: false, min: 0 });
        const encumbrance = calculateEncumbrance(currentLoad, capacity);
        this.encumbrance.carried = encumbrance.carried;
        this.encumbrance.maximum = encumbrance.maximum;
        this.encumbrance.percentage = encumbrance.percentage;
        this.encumbrance.stage = encumbrance.stage;

        // La vitesse persistée reste la base : seuls ses résultats dérivés changent.
        // Les désavantages et interdictions de mouvement sont appliqués manuellement.
        const normalSpeed = stat(this.trackers.speed + totals.speed, "speed", { integer: false, min: 0 });
        this.modifierTotals.speed = normalSpeed - this.trackers.speed;
        this.trackers.effectiveSpeed = encumberedSpeed(normalSpeed, encumbrance.stage);

        for (const abilityKey of Object.keys(this.abilities)) {
            const key = "save" + abilityKey[0].toUpperCase() + abilityKey.slice(1);
            this.savingThrows[abilityKey].total = stat(
                this.savingThrows[abilityKey].mastery
                + this.abilities[abilityKey].modifier + (totals[key] || 0), key);
            this.modifierTotals[key] = this.savingThrows[abilityKey].total - this.savingThrows[abilityKey].mastery - this.abilities[abilityKey].modifier;
        }

        this.consciousness.effectiveMax = stat(this.consciousness.max, "consciousnessMax", { min: 0 });
        this.fever.effectiveMax = stat(this.fever.max, "feverMax", { min: 0 });
        this.consciousnessDice.effectiveMax = stat(this.consciousnessDice.max, "consciousnessDiceMax", { min: 0 });

        // Pourcentage de Conscience
        if (this.consciousness.effectiveMax > 0) {
            this.consciousness.percentage =
                Math.min(100, (this.consciousness.value / this.consciousness.effectiveMax) * 100);
        }
        else {
            this.consciousness.percentage = 0;
        }

        if (this.fever.effectiveMax > 0) {
            this.fever.percentage =
                Math.min(100, (this.fever.value / this.fever.effectiveMax) * 100);
        }
        else {
            this.fever.percentage = 0;
        }
    }
}

export class PlayerCharacterData extends CharacterData {

    static defineSchema() {
        const needs = Object.fromEntries(Object.entries(ARCANE_NEEDS).map(([key, { stages }]) => [
            key,
            new NumberField({
                required: true,
                nullable: false,
                integer: true,
                min: 0,
                max: stages.length - 1,
                initial: stages.length - 1
            })
        ]));

        return {
            ...super.defineSchema(),
            needs: new SchemaField(needs)
        };
    }
}
