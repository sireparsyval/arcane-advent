import { EquipmentData } from "./equipment-data.mjs";


export class ProtectionData extends EquipmentData {

    static defineSchema() {
        return {
            ...super.defineSchema()
        };
    }
}