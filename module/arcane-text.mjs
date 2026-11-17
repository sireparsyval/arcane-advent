import { verseSegments } from "./glyphs.mjs";

// Seuls les identifiants et les caractères visuels sont transmis au chat.
export function renderArcaneText(formula, ownerDocument = document) {
    const output = ownerDocument.createElement("span");
    output.className = "aa-arc-text";
    output.setAttribute("aria-label", String(formula));
    for (const segment of verseSegments(formula)) {
        if (!segment.glyph) {
            output.append(ownerDocument.createTextNode(segment.text));
            continue;
        }
        const glyph = ownerDocument.createElement("span");
        glyph.className = segment.character ? "aa-arc-character" : "aa-arc-pending";
        glyph.textContent = segment.character || segment.id;
        glyph.title = segment.id;
        glyph.setAttribute("aria-label", segment.id);
        output.append(glyph);
    }
    return output;
}

export function registerArcaneText() {
    CONFIG.fontDefinitions.ArcaneGlyphs = {
        editor: true,
        fonts: [{ urls: ["systems/arcane-advent/assets/fonts/ArcaneGlyphs.woff2"], weight: "400" }]
    };
    CONFIG.TextEditor.enrichers.push({
        id: "arcane-advent.glyphs",
        pattern: /@(?:AA|Arcane)\[([^\]]*)\]/giu,
        enricher: match => renderArcaneText(match[1])
    });
}

export async function sendArcaneVerse(actor, verse) {
    const formula = String(verse.formula ?? "");
    if (!formula.trim()) {
        ui.notifications.warn("Ce Verset ne contient aucune formule.");
        return;
    }
    const container = document.createElement("div");
    const name = String(verse.name ?? "").trim();
    if (name) {
        const heading = document.createElement("strong");
        heading.textContent = name;
        container.append(heading);
    }
    const content = document.createElement("div");
    content.className = "aa-arc-verse-message";
    // Garder les IDs dans le message pour qu’un symbole ajouté plus tard y apparaisse.
    // Les crochets terminent une notation @AA, mais restent du texte dans le Verset.
    for (const part of formula.split(/([\[\]])/u)) {
        if (!part) continue;
        if (part === "[" || part === "]") content.append(document.createTextNode(part));
        else content.append(document.createTextNode("@AA[" + part + "]"));
    }
    container.append(content);
    return foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        content: container.innerHTML
    });
}
