import { BaseItemData } from "./base-item-data.mjs";

const { BooleanField, ArrayField, ObjectField } = foundry.data.fields;

export class StorageData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return { locked: new BooleanField({ initial: false }), ground: new BooleanField({ initial: false }) };
    }
}

export class StorageItemData extends BaseItemData {
    static defineSchema() {
        return { ...super.defineSchema(),
            locked: new BooleanField({ initial: false }),
            ground: new BooleanField({ initial: false }),
            contents: new ArrayField(new ObjectField({ nullable: false }), { initial: [] })
        };
    }
}
