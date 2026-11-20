import { BaseItemData } from "./base-item-data.mjs";

export class SceneryElementData extends BaseItemData {}

export class InteractiveElementData extends SceneryElementData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            interactions: new foundry.data.fields.StringField({
                required: true, nullable: false, blank: true, initial: ""
            })
        };
    }
}
