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

            trackers: new SchemaField({
                defense: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    initial: 10,
                    persisted: false
                }),

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
                })
            }),
        };
    }


    prepareDerivedData() {
        super.prepareDerivedData();

        // Modificateurs de caractéristiques
        for (const ability of Object.values(this.abilities)) {
            ability.modifier =
                Math.floor((ability.value - 10) / 2);
        }

        this.trackers.defense =
            10 + this.abilities.dexterity.modifier;

        const hasPerceptionSkill =
            this.parent.items.some(item =>
                item.type === "skill"
                && item.name.trim().toLowerCase() === "perception"
                && item.system.ability === "wisdom"
            );


        this.trackers.passivePerception =
            10
            + this.abilities.wisdom.modifier
            + (hasPerceptionSkill ? 5 : 0);

        this.trackers.initiative =
            this.abilities.dexterity.modifier;

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