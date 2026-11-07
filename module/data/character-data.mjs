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


export class CharacterData extends foundry.abstract.TypeDataModel {

    static defineSchema() {
        return {
            rollMode: new StringField({
                required: true,
                nullable: false,
                initial: "normal"
            }),

            abilities: new SchemaField({
                strength: abilityField(),
                dexterity: abilityField(),
                constitution: abilityField(),
                intelligence: abilityField(),
                wisdom: abilityField(),
                charisma: abilityField()
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
            })
        };
    }


    prepareDerivedData() {
        super.prepareDerivedData();

        // Modificateurs de caractéristiques
        for (const ability of Object.values(this.abilities)) {
            ability.modifier =
                Math.floor((ability.value - 10) / 2);
        }

        // Pourcentage de Conscience
        if (this.consciousness.max > 0) {
            this.consciousness.percentage =
                (this.consciousness.value / this.consciousness.max) * 100;
        }
        else {
            this.consciousness.percentage = 0;
        }
    }
}