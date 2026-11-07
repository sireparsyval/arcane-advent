const { StringField } = foundry.data.fields;

export class BaseItemData extends foundry.abstract.TypeDataModel {

    static defineSchema() {
        return {
            description: new StringField({
                required: true,
                nullable: false,
                blank: true,
                initial: ""
            })
        };
    }
}