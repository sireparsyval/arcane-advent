"""Rebuild ArcaneGlyphs. Requires fonttools and brotli."""
from pathlib import Path
import re

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import SVGPath


def main():
    root = Path(__file__).resolve().parents[1]
    registry = (root / "module" / "glyphs.mjs").read_text(encoding="utf-8")
    entries = re.findall(r'^    (G\d+): "\\u([0-9A-F]{4})",?$', registry, re.MULTILINE)
    if not entries or len({code for _, code in entries}) != len(entries):
        raise ValueError("Le registre doit contenir des caractères distincts.")

    glyphs = {}
    empty = TTGlyphPen(None)
    glyphs[".notdef"] = empty.glyph()
    glyphs["space"] = TTGlyphPen(None).glyph()
    for identifier, _ in entries:
        pen = TTGlyphPen(None)
        curves = Cu2QuPen(pen, max_err=0.25, reverse_direction=True)
        # Les sources partagent une page de 1000 unités. Conserver leurs proportions.
        transformed = TransformPen(curves, (1, 0, 0, -1, 0, 900))
        SVGPath(str(root / "assets" / "glyphs" / (identifier + ".svg"))).draw(transformed)
        glyphs[identifier] = pen.glyph()

    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder(list(glyphs))
    builder.setupCharacterMap({32: "space", **{int(code, 16): name for name, code in entries}})
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics({
        name: (500 if name == "space" else 1000, getattr(glyph, "xMin", 0))
        for name, glyph in glyphs.items()
    })
    builder.setupHorizontalHeader(ascent=900, descent=-100)
    builder.setupNameTable({
        "familyName": "ArcaneGlyphs",
        "styleName": "Regular",
        "uniqueFontIdentifier": "ArcaneGlyphs-Regular-1.0",
        "fullName": "ArcaneGlyphs Regular",
        "psName": "ArcaneGlyphs-Regular",
        "version": "Version 1.000",
    })
    builder.setupOS2(
        sTypoAscender=900, sTypoDescender=-100, sTypoLineGap=0,
        usWinAscent=900, usWinDescent=100,
    )
    builder.setupPost()
    builder.setupMaxp()
    builder.font["head"].created = builder.font["head"].modified = 3877722000
    builder.font.recalcTimestamp = False
    builder.font.flavor = "woff2"
    destination = root / "assets" / "fonts" / "ArcaneGlyphs.woff2"
    destination.parent.mkdir(parents=True, exist_ok=True)
    builder.save(destination)
    print(f"{len(entries)} glyphes — {destination.name}")


if __name__ == "__main__":
    main()
