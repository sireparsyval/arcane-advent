// Registre visuel public. Les identifiants restent stables au fil des dessins.
// Ajouter ici les caractères de la future police, par exemple
// G042: "\uE000"
// Les significations et prononciations de référence appartiennent aux documents du MJ.
export const GLYPH_CHARACTERS = Object.freeze({});

export function normalizeGlyphId(value) {
    return String(value ?? "").trim().toUpperCase();
}

export function isGlyphId(value) {
    return /^G\d{3,}$/u.test(normalizeGlyphId(value));
}

export function glyphDisplay(value, registry = GLYPH_CHARACTERS) {
    const id = normalizeGlyphId(value);
    const character = Object.hasOwn(registry, id) ? registry[id] : "";
    return { id, character, pending: !character };
}

// Conserve chaque séparateur, regroupement et caractère saisi dans la formule.
export function verseSegments(formula, registry = GLYPH_CHARACTERS) {
    const source = String(formula ?? "");
    const pattern = /(?<![\p{L}\p{N}_])G\d{3,}(?![\p{L}\p{N}_])/giu;
    const segments = [];
    let offset = 0;
    for (const match of source.matchAll(pattern)) {
        if (match.index > offset) segments.push({ text: source.slice(offset, match.index) });
        segments.push({ ...glyphDisplay(match[0], registry), glyph: true });
        offset = match.index + match[0].length;
    }
    if (offset < source.length) segments.push({ text: source.slice(offset) });
    return segments;
}

export function insertGlyphId(formula, id, start, end = start) {
    const source = String(formula ?? "");
    const before = source.slice(0, start);
    const after = source.slice(end);
    const identifier = normalizeGlyphId(id);
    const leftSpace = /[\p{L}\p{N}_]$/u.test(before) ? " " : "";
    const rightSpace = /^[\p{L}\p{N}_]/u.test(after) ? " " : "";
    return {
        formula: before + leftSpace + identifier + rightSpace + after,
        cursor: before.length + leftSpace.length + identifier.length + rightSpace.length
    };
}
