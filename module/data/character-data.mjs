const {
    NumberField,
    SchemaField
} = foundry.data.fields;


export class CharacterData extends foundry.abstract.TypeDataModel {

    static defineSchema() {
        return {
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

        if (this.consciousness.max > 0) {
            this.consciousness.percentage =
                Math.floor((this.consciousness.value / this.consciousness.max) * 100);
        }
        else {
            this.consciousness.percentage = 0;
        }
    }
}