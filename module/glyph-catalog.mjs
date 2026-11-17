import { GLYPH_CHARACTERS, isGlyphId, normalizeGlyphId } from "./glyphs.mjs";

export const GLYPH_PACK = "world.arcane-glyphs";
export const GLYPH_SORT_FIELDS = Object.freeze({
    glyphId: "ID", meaning: "Signification", pronunciation: "Prononciation", category: "Famille"
});
const COLLATOR = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
const FIELDS = ["meaning", "pronunciation", "somatic", "category", "description"];
const OWNERSHIP = Object.freeze({ GAMEMASTER: "OWNER", ASSISTANT: "OWNER", TRUSTED: "NONE", PLAYER: "NONE" });
let loading;

export function sortGlyphReferences(entries, field = "glyphId", direction = "ascending") {
    const key = Object.hasOwn(GLYPH_SORT_FIELDS, field) ? field : "glyphId";
    const order = direction === "descending" ? -1 : 1;
    return [...entries].sort((a, b) =>
        order * COLLATOR.compare(a[key] ?? "", b[key] ?? "")
        || COLLATOR.compare(a.glyphId ?? "", b.glyphId ?? "")
    );
}

export function requireGlyphGM() {
    if (!game.user.isGM) throw new Error("Le répertoire des glyphes est réservé au MJ.");
}

export function glyphReferenceName(system) {
    return [system.glyphId, system.meaning, system.pronunciation].filter(value => value?.trim()).join(" · ");
}

export function parseGlyphReferences(data) {
    if (data?.format !== "arcane-advent.glyph-references" || data.version !== 1 || !Array.isArray(data.glyphs)) {
        throw new Error("Choisissez un fichier de références de glyphes Arcane Advent.");
    }
    const ids = new Set();
    return data.glyphs.map(entry => {
        const glyphId = normalizeGlyphId(entry?.glyphId);
        if (!isGlyphId(glyphId) || ids.has(glyphId)) throw new Error("ID absent, invalide ou présent plusieurs fois.");
        ids.add(glyphId);
        const system = { glyphId };
        for (const field of FIELDS) {
            if (!Object.hasOwn(entry, field)) continue;
            if (typeof entry[field] !== "string") throw new Error("Champ de référence invalide pour " + glyphId);
            if (entry[field].trim()) system[field] = entry[field];
        }
        return system;
    });
}

export async function getGlyphCatalog() {
    requireGlyphGM();
    if (loading) return loading;
    loading = openCatalog();
    try {
        return await loading;
    } finally {
        loading = null;
    }
}

async function openCatalog() {
    let pack = game.packs.get(GLYPH_PACK);
    if (!pack) {
        try {
            pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
                name: "arcane-glyphs", label: "Glyphes — MJ", type: "Item", ownership: { ...OWNERSHIP }
            });
            await game.settings.set("arcane-advent", "glyphCatalogSeeded", false);
        } catch (error) {
            pack = game.packs.get(GLYPH_PACK);
            if (!pack) throw error;
        }
    }
    if (pack.documentName !== "Item" || pack.metadata.packageType !== "world") {
        throw new Error("Le compendium world.arcane-glyphs doit contenir des objets du monde.");
    }
    const ownership = pack.ownership;
    if (pack.locked || Object.entries(OWNERSHIP).some(([role, level]) => ownership[role] !== level)) {
        await pack.configure({ ownership: { ...OWNERSHIP }, locked: false });
    }
    if (!game.settings.get("arcane-advent", "glyphCatalogSeeded")) {
        const documents = await pack.getDocuments({ type: "glyph" });
        const known = new Set(documents.map(item => item.system.glyphId));
        const records = Object.keys(GLYPH_CHARACTERS).filter(id => !known.has(id)).map(glyphId => ({
            // IDs stables pour que deux MJ initialisant ensemble créent les mêmes documents.
            _id: ("glyph" + GLYPH_CHARACTERS[glyphId].codePointAt(0).toString(16) + "x").padEnd(16, "0"),
            name: glyphId, type: "glyph", system: { glyphId }, ownership: { default: 0 }
        }));
        if (records.length) {
            try {
                await foundry.documents.Item.implementation.createDocuments(records, { pack: pack.collection, keepId: true });
            } catch (error) {
                const existing = await pack.getDocuments({ type: "glyph" });
                const ids = new Set(existing.map(item => item.system.glyphId));
                if (records.some(item => !ids.has(item.system.glyphId))) throw error;
            }
        }
        await game.settings.set("arcane-advent", "glyphCatalogSeeded", true);
    }
    return pack;
}

export async function importGlyphReferences(data) {
    requireGlyphGM();
    const references = parseGlyphReferences(data);
    const pack = await getGlyphCatalog();
    const documents = await pack.getDocuments({ type: "glyph" });
    const byId = new Map(documents.map(item => [item.system.glyphId, item]));
    const creates = [];
    const updates = [];
    for (const reference of references) {
        const existing = byId.get(reference.glyphId);
        if (existing) {
            const system = { ...existing.system.toObject(), ...reference };
            updates.push({
                _id: existing.id, name: glyphReferenceName(system),
                ...Object.fromEntries(Object.entries(reference).map(([key, value]) => ["system." + key, value]))
            });
        } else {
            creates.push({ name: glyphReferenceName(reference), type: "glyph", system: reference, ownership: { default: 0 } });
        }
    }
    // Réexécuter un import reprend les entrées déjà enregistrées après un échec partiel.
    if (creates.length) await foundry.documents.Item.implementation.createDocuments(creates, { pack: pack.collection });
    if (updates.length) await foundry.documents.Item.implementation.updateDocuments(updates, { pack: pack.collection });
    return references.length;
}

export async function showGlyphInChat(glyphId) {
    requireGlyphGM();
    const id = normalizeGlyphId(glyphId);
    if (!isGlyphId(id)) throw new Error("Identifiant de glyphe invalide.");
    // Le contenu du message ne contient que l’ID, sans nom ou données de référence.
    return foundry.documents.ChatMessage.create({
        content: "@AA[" + id + "]"
    });
}
