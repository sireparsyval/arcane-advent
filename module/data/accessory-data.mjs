import { EquipmentData } from "./equipment-data.mjs";


export class AccessoryData extends EquipmentData {

    static defineSchema() {
        return {
            ...super.defineSchema()
        };
    }
}