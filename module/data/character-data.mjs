import { ARCANE_NEEDS } from "../config.mjs";
import { modifierSchema, modifierTotals as collectModifierTotals, ABILITY_MODIFIER_KEYS, abilityScoreModifier } from "../modifiers.mjs";

const {
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;


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

        // Tous les effets se cumulent sur les scores AVANT le calcul du modificateur.
        // Les bonus directs sur les Trackers sont appliqués plus bas, une seule fois.
        const totals = collectModifierTotals(this.manualModifiers, this.parent?.items);
        for (const key of Object.keys(totals)) this.modifierTotals[key] = totals[key];

        for (const key of ABILITY_MODIFIER_KEYS) {
            const ability = this.abilities[key];
            ability.effective = ability.value + totals[key];
            ability.modifier = abilityScoreModifier(ability.value, totals[key]);
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


        this.defense.base =
            10
            + this.defense.abilityModifier
            + this.defense.shieldBonus
            + totals.defense;


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

        this.defense.zones.head = this.defense.base + protectionBonuses.head;
        this.defense.zones.torso = this.defense.base + protectionBonuses.torso;
        this.defense.zones.arms = this.defense.base + protectionBonuses.arms;
        this.defense.zones.legs = this.defense.base + protectionBonuses.legs;

        const hasPerceptionSkill =
            this.parent.items.some(item =>
                item.type === "skill"
                && item.name.trim().toLowerCase() === "perception"
                && item.system.ability === "wisdom"
            );


        this.trackers.passivePerception =
            10
            + this.abilities.wisdom.modifier
            + (hasPerceptionSkill ? 5 : 0)
            + totals.passivePerception;

        this.trackers.initiative =
            this.abilities.dexterity.modifier + totals.initiative;

        // La vitesse persistée reste sa valeur de base, même après un bonus/malus.
        this.trackers.effectiveSpeed = Math.max(0, this.trackers.speed + totals.speed);

        for (const abilityKey of Object.keys(this.abilities)) {
            this.savingThrows[abilityKey].total =
                this.savingThrows[abilityKey].mastery
                + this.abilities[abilityKey].modifier;
        }

        // Pourcentage de Conscience
        if (this.consciousness.max > 0) {
            this.consciousness.percentage =
                (this.consciousness.value / this.consciousness.max) * 100;
        }
        else {
            this.consciousness.percentage = 0;
        }

        if (this.fever.max > 0) {
            this.fever.percentage =
                (this.fever.value / this.fever.max) * 100;
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
