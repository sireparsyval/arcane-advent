import { BaseItemData } from "./base-item-data.mjs";

const { BooleanField, ArrayField, ObjectField, NumberField } = foundry.data.fields;

export class StorageData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return { locked: new BooleanField({ initial: false }), ground: new BooleanField({ initial: false }), fixedOnScene: new BooleanField({ initial: false }) };
    }
}

export class StorageItemData extends BaseItemData {
    static defineSchema() {
        return { ...super.defineSchema(),
            locked: new BooleanField({ initial: false }),
            ground: new BooleanField({ initial: false }),
            fixedOnScene: new BooleanField({ initial: false }),
            imageAngleOffset: new NumberField({ required: true, nullable: false, initial: 0, min: -360, max: 360 }),
            groundTokenSize: new NumberField({ required: true, nullable: false, min: 0.1, initial: 1.5 }),
            contents: new ArrayField(new ObjectField({ nullable: false }), { initial: [] })
        };
    }
}
