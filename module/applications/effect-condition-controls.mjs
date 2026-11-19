import { BOOLEAN_CONDITION_METRICS, CONDITION_METRICS, CONDITION_OPERATORS, CONDITION_KEYS,
    aptitudeConditionStatus, aptitudeExpressionVariables, conditionKeyChoices, conditionMetricValue, conditionSummary } from "../aptitude-conditions.mjs";
import { conditionActor } from "../character-effects.mjs";

export const escape = value => String(value ?? "").replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const options = (entries, selected) => Object.entries(entries).map(([key, label]) =>
    `<option value="${escape(key)}" ${String(selected) === key ? "selected" : ""}>${escape(label)}</option>`).join("");

export function newCondition(kind = "automatic") {
    return { label: "", kind, enabled: false, metric: "pdcRatio", operator: "<", value: 50, key: "", expression: "", consumes: false };
}

export function conditionControls(actor, condition) {
    const boolean = BOOLEAN_CONDITION_METRICS.includes(condition.metric), manual = condition.kind === "manual";
    const choices = conditionKeyChoices(actor, condition.metric);
    const fixedKeys = ["abilityBase", "abilityModifier"].includes(condition.metric) ? "ability" : condition.metric;
    const fixed = Boolean(CONDITION_KEYS[fixedKeys]);
    const custom = condition.key && !choices.some(choice => choice.value === condition.key);
    const validBoolean = [0, 1].includes(Number(condition.value)) && ["=", "!="].includes(condition.operator);
    const present = !validBoolean || (Number(condition.value) === 1) === (condition.operator === "=");
    const keyControl = choices.length || fixed ? `<select data-cfield="keyChoice">
        <option value="">Choisir…</option>${options(Object.fromEntries(choices.map(({ value, label }) => [value, label])), custom ? "__custom__" : condition.key)}
        ${fixed ? "" : `<option value="__custom__" ${custom ? "selected" : ""}>Autre nom / classe…</option>`}</select>
        ${fixed ? "" : `<input data-cfield="customKey" type="text" value="${escape(custom ? condition.key : "")}" placeholder="Nom exact ou classe" ${custom ? "" : "hidden disabled"}>`}`
        : `<input data-cfield="customKey" type="text" value="${escape(condition.key)}" placeholder="Nom exact ou classe">`;
    const needsKey = !["pdcRatio", "pdfRatio", "pdc", "pdf", "pdcMax", "pdfMax", "formula"].includes(condition.metric);
    const advanced = condition.metric === "formula";
    return `<div class="aa-effect-condition-fields">
        <label>Nom / repère (facultatif)<input data-cfield="label" type="text" value="${escape(condition.label)}" placeholder="Ex. Blessé, Sans armure…"></label>
        <label>Vérification<select data-cfield="kind">${options({ automatic: "Automatique : lire la fiche", manual: "Manuelle : cocher à la table" }, condition.kind)}</select></label>
        ${manual ? `<label class="checkbox"><input data-cfield="enabled" type="checkbox" ${condition.enabled ? "checked" : ""}>Condition validée</label>` : `
        <label>Information de la fiche<select data-cfield="metric">${options(CONDITION_METRICS, condition.metric)}</select></label>
        ${needsKey ? `<label>Cible du critère${keyControl}</label>` : ""}
        ${advanced ? `<label>Expression<textarea data-cfield="expression" rows="2" placeholder="pdc < pdcMax * 0.5 && FOR >= 14">${escape(condition.expression)}</textarea></label>
            <details><summary>Variables disponibles et valeurs actuelles</summary><p class="hint">Opérateurs : + − * /, &lt; &lt;= == != &gt;= &gt;, &amp;&amp; (ET), || (OU), ! (NON). Aucun JavaScript.</p>
            <dl class="aa-expression-variables">${Object.entries(aptitudeExpressionVariables(conditionActor(actor))).map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join("")}</dl></details>`
            : boolean ? `<label>Résultat attendu<select data-cfield="presence">${options({ yes: "Oui / présent / porté", no: "Non / absent / non porté" }, present ? "yes" : "no")}</select></label>`
            : `<div class="aa-effect-grid"><label>Comparaison<select data-cfield="operator">${options(CONDITION_OPERATORS, condition.operator)}</select></label>
            <label>Seuil${["pdcRatio", "pdfRatio"].includes(condition.metric) ? " (%)" : ""}<input data-cfield="value" type="number" step="any" value="${escape(condition.value)}" required></label></div>`}`}
        <p class="aa-effect-condition-preview" data-condition-preview aria-live="polite"></p>
    </div>`;
}

export function readConditionControls(root, starting) {
    const result = { ...starting };
    for (const field of root.querySelectorAll("[data-cfield]")) {
        if (field.disabled || ["keyChoice", "customKey", "presence"].includes(field.dataset.cfield)) continue;
        result[field.dataset.cfield] = field.type === "checkbox" ? field.checked : field.type === "number" ? Number(field.value) : field.value;
    }
    const choice = root.querySelector('[data-cfield="keyChoice"]');
    result.key = choice && choice.value !== "__custom__" ? choice.value
        : root.querySelector('[data-cfield="customKey"]')?.value.trim() ?? result.key;
    const presence = root.querySelector('[data-cfield="presence"]');
    if (presence) { result.operator = presence.value === "yes" ? "=" : "!="; result.value = 1; }
    return result;
}

export function validateCondition(condition) {
    if (condition.kind === "manual") return;
    if (!Object.hasOwn(CONDITION_METRICS, condition.metric)) throw Error("Choisissez une information valide pour la condition.");
    if (!["pdcRatio", "pdfRatio", "pdc", "pdf", "pdcMax", "pdfMax", "formula"].includes(condition.metric) && !condition.key?.trim()) {
        throw Error("Choisissez la cible de chaque condition (équipement, caractéristique, objet…).");
    }
    if (condition.metric === "formula" && !condition.expression?.trim()) throw Error("L'expression de la condition est vide.");
    if (!Number.isFinite(Number(condition.value))) throw Error("Le seuil de la condition est invalide.");
}

export function bindConditionControls(root, actor, starting, onChange = () => {}) {
    let current = { ...starting };
    const updatePreview = () => {
        const view = conditionActor(actor), target = root.querySelector("[data-condition-preview]");
        const value = current.kind === "manual" ? null : conditionMetricValue(view, current);
        target.textContent = `${conditionSummary(actor, current)} · ${value === null ? "" : `Lecture actuelle : ${Number.isFinite(value) ? value : "cible à préciser"} · `}${aptitudeConditionStatus(view, current) ? "✓ Remplie" : "✗ Non remplie"}`;
    };
    const listener = event => {
        if (!event.target.matches("[data-cfield]")) return;
        const oldMetric = current.metric, oldKind = current.kind;
        current = readConditionControls(root, current);
        if (current.metric !== oldMetric) {
            current.key = "";
            current.operator = BOOLEAN_CONDITION_METRICS.includes(current.metric) ? "=" : "<";
            current.value = BOOLEAN_CONDITION_METRICS.includes(current.metric) ? 1 : 50;
        }
        onChange(current);
        if (current.metric !== oldMetric || current.kind !== oldKind) {
            root.innerHTML = conditionControls(actor, current);
        }
        if (event.target.dataset.cfield === "keyChoice") {
            const custom = root.querySelector('[data-cfield="customKey"]');
            if (custom) { custom.hidden = event.target.value !== "__custom__"; custom.disabled = custom.hidden; }
        }
        updatePreview();
    };
    root.addEventListener("change", listener);
    root.addEventListener("input", event => {
        if (!event.target.matches("input[data-cfield], textarea[data-cfield]")) return;
        current = readConditionControls(root, current); onChange(current); updatePreview();
    });
    updatePreview();
}
