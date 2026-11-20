import { BaseItemData } from "./base-item-data.mjs";

function sceneFields({ interactive = false, visual = false } = {}) {
    const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
    const number = (initial, min, max) => new NumberField({ required: true, nullable: false, initial, min, max });
    return {
        placement: new SchemaField({
            image: new StringField({ blank: true, initial: "" }),
            width: number(1, 0.1), height: number(1, 0.1), radius: number(3, 0.1),
            rotation: number(0, 0, 360), opacity: number(1, 0, 1), elevation: number(0)
        }),
        interaction: new SchemaField({
            movable: new BooleanField({ initial: false }),
            toggleLight: new BooleanField({ initial: interactive })
        }),
        light: new SchemaField({
            enabled: new BooleanField({ initial: visual }),
            initiallyOn: new BooleanField({ initial: true }),
            dim: number(3, 0), bright: number(0, 0),
            color: new StringField({ initial: visual ? "#84952f" : "#d9a15b", blank: false }),
            alpha: number(0.45, 0, 1), luminosity: number(visual ? 0 : 0.5, 0, 1),
            walls: new BooleanField({ initial: true }),
            animation: new StringField({ blank: true, initial: visual ? "fog" : "" }),
            speed: number(2, 0, 10), intensity: number(5, 0, 10),
            reverse: new BooleanField({ initial: false })
        }),
        showBoundary: new BooleanField({ initial: false })
    };
}

export class SceneryElementData extends BaseItemData {
    static defineSchema() { return { ...super.defineSchema(), ...sceneFields() }; }
}

export class InteractiveElementData extends BaseItemData {
    static defineSchema() {
        return { ...super.defineSchema(), ...sceneFields({ interactive: true }),
            interactions: new foundry.data.fields.StringField({ required: true, nullable: false, blank: true, initial: "" }) };
    }
}

export class VisualEffectData extends BaseItemData {
    static defineSchema() { return { ...super.defineSchema(), ...sceneFields({ visual: true }) }; }
}
