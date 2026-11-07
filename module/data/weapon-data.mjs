import { BaseItemData } from "./base-item-data.mjs";

export class WeaponData extends BaseItemData {

    static defineSchema() {
        return {
            ...super.defineSchema()
        };
    }
}