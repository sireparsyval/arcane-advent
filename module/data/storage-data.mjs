const { BooleanField } = foundry.data.fields;

export class StorageData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return { locked: new BooleanField({ initial: false }), ground: new BooleanField({ initial: false }) };
    }
}
