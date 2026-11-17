import test from "node:test";
import assert from "node:assert/strict";
import { glyphDisplay, insertGlyphId, isGlyphId, verseSegments } from "../module/glyphs.mjs";

test("les IDs gardent leur identité lors d’un changement de symbole", () => {
    assert.deepEqual(glyphDisplay(" g042 "), { id: "G042", character: "", pending: true });
    assert.deepEqual(glyphDisplay("G042", { G042: "\uE000" }),
        { id: "G042", character: "\uE000", pending: false });
    assert.equal(isGlyphId("G1000"), true);
    assert.equal(isGlyphId("EAU"), false);
    assert.equal(isGlyphId("G042<script>"), false);
});

test("un Verset conserve espaces, ponctuation, regroupements et texte inconnu", () => {
    const source = "  (g042-G017)\n\tG999 mot <b> G108fin";
    const segments = verseSegments(source, { G042: "\uE000" });
    assert.equal(segments.filter(segment => segment.glyph).length, 3);
    assert.equal(segments.find(segment => segment.id === "G999").pending, true);
    assert.equal(segments.map(segment => segment.glyph ? segment.id : segment.text).join(""),
        source.replace("g042", "G042"));
    assert.equal(segments[1].character, "\uE000");
});

test("l’insertion remplace la sélection et garde les regroupements", () => {
    assert.deepEqual(insertGlyphId("G017G108", "G042", 4), {
        formula: "G017 G042 G108", cursor: 10
    });
    assert.deepEqual(insertGlyphId("(G017)\nG108", "G042", 1, 5), {
        formula: "(G042)\nG108", cursor: 5
    });
});
