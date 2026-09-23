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
                    initial: 10
                }),

                max: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 10
                })
            })
        };
    }
}