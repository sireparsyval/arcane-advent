const { SchemaField, StringField, TypedObjectField } = foundry.data.fields;

function noteField() {
    return new StringField({ required: true, nullable: false, blank: true, trim: false, initial: "" });
}

function entries(fields) {
    return new TypedObjectField(new SchemaField(
        Object.fromEntries(fields.map(key => [key, noteField()]))
    ), { required: true, nullable: false, initial: {} });
}

// Les données du carnet décrivent uniquement ce que le personnage a consigné.
export function arcanologyField() {
    return new SchemaField({
        glyphs: entries(["glyphId", "meaning", "pronunciation", "somatic", "notes"]),
        verses: entries(["name", "formula", "translation", "notes"])
    }, { required: true, nullable: false });
}
