import { BaseItemData } from "./base-item-data.mjs";
import { LUQA_DENOMINATIONS } from "../inventory.mjs";

const { NumberField, SchemaField, StringField } = foundry.data.fields;

class InventoryItemData extends BaseItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            containerId: new StringField({ required: true, nullable: true, blank: false, initial: null })
        };
    }
}

export class ContainerData extends InventoryItemData {}

export class PurseData extends ContainerData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            coins: new SchemaField(Object.fromEntries(LUQA_DENOMINATIONS.map(({ key }) => [
                key,
                new NumberField({
                    required: true, nullable: false, integer: true,
                    min: 0, max: Number.MAX_SAFE_INTEGER, initial: 0
                })
            ])))
        };
    }
}

export class WeightedItemData extends InventoryItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            weight: new NumberField({
                required: true,
                nullable: false,
                min: 0,
                initial: 0
            })
        };
    }
}

export class ObjectData extends WeightedItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            quantity: new NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 })
        };
    }
}
