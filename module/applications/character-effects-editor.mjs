import { EFFECT_ABILITIES, EFFECT_ROLL_SCOPES, EFFECT_STAT_TARGETS,
    activeCharacterEffects, characterEffectSources, conditionActor, effectRuleSummary, effectRuleActive, effectRuleSettings, effectSourceActive,
    newEffectRule, resolveRollEffects } from "../character-effects.mjs";
import { conditionSummary } from "../aptitude-conditions.mjs";
import { fixedEffectAmount, resolveEffectAmount } from "../effect-amounts.mjs";
import { bindConditionControls, conditionControls, escape, newCondition, options, validateCondition } from "./effect-condition-controls.mjs";

const copy = value => JSON.parse(JSON.stringify(value ?? {}));
const checked = value => value ? "checked" : "";
const input = (field, value, attributes = "") => `<input data-efield="${field}" value="${escape(value)}" ${attributes}>`;
const select = (field, values, value) => `<select data-efield="${field}">${options(values, value)}</select>`;

const editorAmount = (actor, rule) => resolveEffectAmount(actor, rule, { deferReferences: !actor?.system?.abilities });
const summaryActor = actor => actor?.system?.abilities ? actor : null;

function amountPreview(actor, rule) {
    const result = editorAmount(actor, rule);
    if (result.pending) return "Valeur calculée une fois cet élément ajouté à un personnage.";
    return result.error || `Valeur actuelle : ${result.value > 0 ? "+" : ""}${result.value}`;
}

function amountInput(actor, rule, label) {
    return `<label>${label}${input("amount", rule.amountFormula || rule.amount,
        'type="text" required spellcheck="false" placeholder="Nombre, référence ou max(@abilities.dexterity.modifier, @abilities.constitution.modifier)"')}
        <small data-amount-preview aria-live="polite">${escape(amountPreview(actor, rule))}</small></label>`;
}

function statRuleHTML(actor, rule) {
    return `<div class="aa-effect-grid">
        <label>Valeur à modifier${select("target", EFFECT_STAT_TARGETS, rule.target)}</label>
        ${amountInput(actor, rule, "Bonus / malus fixe")}
        <label>Coefficient${input("coefficient", rule.coefficient, 'type="number" min="0" step="any" required')}</label>
        <label>Appliquer le montant fixe<select data-efield="addBefore">${options({ no: "Après multiplication", yes: "Avant multiplication" }, rule.addBefore ? "yes" : "no")}</select></label>
    </div><p class="hint" data-rule-summary>${escape(effectRuleSummary(rule, { actor: summaryActor(actor) }))}</p>`;
}

function rollRuleHTML(actor, rule) {
    return `<div class="aa-effect-grid">
        <label>Jets concernés${select("scope", EFFECT_ROLL_SCOPES, rule.scope)}</label>
        <label>Caractéristique associée${select("ability", { "": "Toutes / sans filtre", ...EFFECT_ABILITIES }, rule.ability)}</label>
        <label>Compétence précise (facultative)<input data-efield="skill" list="aa-effect-skills" value="${escape(rule.skill)}" placeholder="Toutes les compétences"></label>
        ${amountInput(actor, rule, "Bonus / malus au jet")}
    </div><div class="aa-effect-roll-flags">
        <label class="checkbox"><input data-efield="advantage" type="checkbox" ${checked(rule.advantage)}>Avantage</label>
        <label class="checkbox"><input data-efield="disadvantage" type="checkbox" ${checked(rule.disadvantage)}>Désavantage</label>
    </div><p class="hint" data-rule-summary>${escape(effectRuleSummary(rule, { actor: summaryActor(actor) }))}</p>`;
}

function ruleConditionsHTML(rule, conditions, ownerType) {
    const custom = rule.activationMode === "conditions";
    const modes = { always: "Lorsque l’effet est activé", conditions: "Selon les conditions sélectionnées",
        ...(ownerType === "aptitude" ? { passive: "Si l’aptitude est passive", duration: "Pendant la durée de l’aptitude" } : {}) };
    const selected = new Set(rule.conditionIds ?? []);
    const entries = Object.entries(conditions).map(([id, condition], index) => ({
        id, label: condition.label?.trim() || `Condition ${condition.kind === "manual" ? "manuelle" : "automatique"} ${index + 1}`
    }));
    for (const id of selected) {
        if (!Object.hasOwn(conditions, id)) entries.push({ id, label: "Condition supprimée — désélectionner cette référence" });
    }
    return `<fieldset class="aa-effect-rule-conditions"><legend>Activation de cet effet</legend>
        <label>Quand appliquer cet effet ?${select("activationMode", modes, rule.activationMode)}</label>
        ${custom ? `<label>Combinaison${select("conditionMatch", { all: "Toutes les conditions sélectionnées (ET)", any: "Au moins une condition sélectionnée (OU)" }, rule.conditionMatch ?? "all")}</label>
            <div class="aa-effect-condition-choices">${entries.map(({ id, label }) => `<label class="checkbox"><input type="checkbox" data-rule-condition-id="${escape(id)}" ${checked(selected.has(id))}>${escape(label)}</label>`).join("") || '<p class="hint">Aucune condition créée dans cette source.</p>'}</div>
            <p class="hint">Sans condition sélectionnée, cet effet n’exige aucune condition.</p>`
            : '<p class="hint">La coche Activé permet d’activer ou de désactiver cet effet.</p>'}
    </fieldset>`;
}

function sourceData(owner) {
    return { name: owner.name, description: owner.system.description ?? "", requirements: owner.system.requirements ?? "",
        category: owner.system.category, requireConditions: Boolean(owner.system.requireConditions),
        effectRules: Object.fromEntries(Object.entries(copy(owner.system.effectRules))
            .map(([id, rule]) => [id, effectRuleSettings(owner, rule)])),
        conditions: copy(owner.system.conditions), conditionMatch: owner.system.conditionMatch ?? "all" };
}

function replacementWithDeletions(before, after) {
    const result = { ...after };
    for (const id of Object.keys(before ?? {})) if (!Object.hasOwn(after, id)) result[id] = new foundry.data.operators.ForcedDeletion();
    return result;
}

export async function openCharacterEffectsEditor(owner, { actor = owner.actor ?? owner, parent = null } = {}) {
    if (!owner.isOwner) return ui.notifications.warn("Vous n'avez pas le droit de modifier cette source.");
    const draft = sourceData(owner), isItem = ["trait", "aptitude"].includes(owner.type);
    let tab = "effects";
    const content = document.createElement("div"); // DialogV2 requires an unadorned outer div.
    content.innerHTML = '<section class="aa-effects-editor" data-effect-editor></section>';
    const dialog = new foundry.applications.api.DialogV2({
        window: { title: `${isItem ? owner.type === "trait" ? "Trait" : "Aptitude" : "Effets permanents"} — ${owner.name}`, resizable: true },
        position: { width: 850, height: 760 }, content, modal: true, form: { closeOnSubmit: false },
        buttons: [{ action: "save", label: "Enregistrer", callback: async (_event, button, app) => {
            button.form.querySelector(":focus")?.blur();
            if (!button.form.reportValidity()) return;
            try {
                for (const rule of Object.values(draft.effectRules)) {
                    const amount = editorAmount(actor, rule);
                    if (amount.error) throw Error(amount.error);
                    if (rule.kind === "stat" && (!Number.isFinite(Number(rule.coefficient)) || rule.coefficient < 0)) throw Error("Coefficient invalide.");
                    if (rule.activationMode === "conditions") {
                        if (!["all", "any"].includes(rule.conditionMatch ?? "all")) throw Error("Combinaison de conditions invalide.");
                        if (Array.from(rule.conditionIds ?? []).some(id => !Object.hasOwn(draft.conditions, id))) {
                            throw Error("Une condition sélectionnée par un effet a été supprimée. Ajustez sa sélection de conditions.");
                        }
                    }
                }
                for (const condition of Object.values(draft.conditions)) {
                    validateCondition(condition);
                }
                const updates = {
                    "system.effectRules": replacementWithDeletions(owner.system.effectRules, draft.effectRules),
                    "system.conditions": replacementWithDeletions(owner.system.conditions, draft.conditions) };
                if (isItem) Object.assign(updates, { name: draft.name.trim() || owner.name, "system.description": draft.description, "system.requirements": draft.requirements });
                if (owner.type === "aptitude") Object.assign(updates, {
                    "system.category": draft.category, "system.requireConditions": draft.requireConditions,
                    "system.conditionMatch": draft.conditionMatch
                });
                await owner.update(updates);
                await app.close();
            } catch (error) { ui.notifications.error(error.message); }
        } }, { action: "cancel", label: "Annuler", type: "button", callback: (_event, _button, app) => app.close() }]
    });

    const render = () => {
        const root = dialog.element.querySelector("[data-effect-editor]");
        const rules = Object.entries(draft.effectRules);
        root.innerHTML = `<nav class="aa-effect-tabs" aria-label="Éditeur d'effets">${Object.entries({ effects: "Effets", activation: "Conditions", identity: isItem ? "Description" : "Aide", preview: "Récapitulatif" }).map(([key, label]) => `<button type="button" data-effect-tab="${key}" aria-pressed="${tab === key}">${label}</button>`).join("")}</nav>
            <datalist id="aa-effect-skills">${[...(actor.items ?? [])].filter(item => item.type === "skill").map(item => `<option value="${escape(item.name)}"></option>`).join("")}</datalist>
            <div class="aa-effect-body">
            ${tab === "effects" ? `<p class="hint">Les effets s'appliquent au personnage qui possède cette source. Ajoutez autant de règles que nécessaire.</p>
                <div class="aa-effect-toolbar"><button type="button" data-add-effect="stat">+ Bonus / malus / coefficient</button><button type="button" data-add-effect="roll">+ Effet sur les jets</button></div>
                ${rules.map(([id, rule]) => `<article class="aa-effect-card" data-effect-rule="${escape(id)}">
                    <div class="aa-effect-card-heading"><label class="checkbox"><input data-efield="enabled" type="checkbox" ${checked(rule.enabled !== false)}>Activé</label>
                    ${input("label", rule.label, 'type="text" placeholder="Nom de l’effet (facultatif)" aria-label="Nom de l’effet"')}
                    <button type="button" data-duplicate-effect="${escape(id)}" title="Dupliquer cet effet">⧉</button>
                    <button type="button" data-remove-effect="${escape(id)}" title="Retirer cet effet">×</button></div>
                    ${rule.kind === "roll" ? rollRuleHTML(actor, rule) : statRuleHTML(actor, rule)}
                    ${ruleConditionsHTML(rule, draft.conditions, owner.type)}</article>`).join("") || '<p class="hint">Aucun effet configuré.</p>'}
                <p class="hint">Bonus / malus : nombre fixe ou référence à la fiche, par exemple @abilities.strength.value (score de Force), @abilities.strength.modifier (modificateur), ou -@abilities.strength.modifier pour un malus. Le préfixe @system. est aussi accepté. Formules : max(@abilities.dexterity.modifier, @abilities.constitution.modifier), min(...), abs(...), floor(...), ceil(...) et round(...), avec +, −, *, / et des parenthèses. Les arguments sont séparés par des virgules ; les décimales utilisent un point dans les formules. Pour un élément possédé : @items.ID.system.level, avec son identifiant réel.</p>
                <p class="hint">Un avantage et un désavantage s'annulent, même s'il y a plusieurs sources d'un côté. « Neutre » sur la fiche n'efface pas les effets permanents. Pour les formules d'aptitude autres que 1d20, seul le bonus fixe ciblant les jets d'aptitude s'applique ; la formule reste telle qu'elle a été écrite.</p>` : ""}
            ${tab === "activation" ? `<p class="hint">Les conditions sont créées ici, puis sélectionnées dans chaque effet avec leur combinaison ET/OU.</p>
                <p class="hint">Les critères automatiques lisent la fiche avant les effets des Traits et Aptitudes. Un effet ne peut donc pas déclencher ou annuler sa propre condition.</p>
                ${owner.type === "aptitude" ? `<label class="checkbox"><input data-draft="requireConditions" type="checkbox" ${checked(draft.requireConditions)}>Exiger ces conditions pour lancer les jets de l'aptitude</label>
                <label>Combinaison pour l’utilisation de l’aptitude<select data-draft="conditionMatch">${options({ all: "Toutes doivent être remplies (ET)", any: "Au moins une doit être remplie (OU)" }, draft.conditionMatch)}</select></label>` : ""}
                <button type="button" data-add-condition>+ Ajouter un critère</button>
                ${Object.entries(draft.conditions).map(([id, condition]) => `<article class="aa-effect-card"><div class="aa-effect-card-heading"><strong>Critère</strong><button type="button" data-remove-condition="${escape(id)}">Retirer</button></div><div data-effect-condition="${escape(id)}">${conditionControls(actor, condition)}</div></article>`).join("")}` : ""}
            ${tab === "identity" ? isItem ? `<label>Nom<input data-draft="name" type="text" value="${escape(draft.name)}" required></label>
                ${owner.type === "aptitude" ? `<label>Catégorie<select data-draft="category">${options({ technique: "Technique", spell: "Sort", hybrid: "Hybride", passive: "Passif" }, draft.category)}</select></label>` : ""}
                <label>Description<textarea data-draft="description" rows="8">${escape(draft.description)}</textarea></label><label>Conditions / précisions libres<textarea data-draft="requirements" rows="3">${escape(draft.requirements)}</textarea></label>`
                : `<p>Les effets permanents saisis ici complètent ceux des Traits, Aptitudes, Altérations et Blessures.</p><p>Utilisez le montant fixe pour un bonus/malus et le coefficient pour une multiplication (1 = inchangé). Les bonus avant multiplication s'additionnent, les coefficients se multiplient, puis les bonus après multiplication s'ajoutent. Les résultats entiers sont arrondis à l'inférieur ; vitesse et charge conservent les décimales.</p><p>Les maxima de PdC, PdF et Dés de Conscience sont affichés avec leur total effectif, sans modifier leur valeur de base ni ajouter de points actuels.</p>` : ""}
            ${tab === "preview" ? `<p><strong>Source ${effectSourceActive(conditionActor(actor), { type: owner.type, system: { ...draft, category: draft.category } }) ? "active" : "inactive"}</strong></p>
                <ul>${rules.map(([, rule]) => `<li>${rule.enabled === false ? "Désactivé" : !resolveEffectAmount(actor, rule).error && effectRuleActive(conditionActor(actor), { type: owner.type, system: draft }, rule) ? "Actif" : "Inactif"} — ${escape(rule.label ? rule.label + " : " : "")}${escape(effectRuleSummary(rule, { actor: summaryActor(actor) }))}</li>`).join("") || "<li>Aucun effet.</li>"}</ul>
                <p>Conditions disponibles</p><ul>${Object.values(draft.conditions).map(condition => `<li>${escape(conditionSummary(actor, condition))}</li>`).join("") || "<li>Aucune condition.</li>"}</ul>
                <p class="hint">Les changements de cette fenêtre seront appliqués à l'enregistrement.</p>` : ""}
            </div>`;
        for (const host of root.querySelectorAll("[data-effect-condition]")) {
            const id = host.dataset.effectCondition;
            bindConditionControls(host, actor, draft.conditions[id], data => { draft.conditions[id] = data; });
        }
        root.removeEventListener("change", change); root.removeEventListener("input", change); root.removeEventListener("click", click);
        root.addEventListener("change", change); root.addEventListener("input", change); root.addEventListener("click", click);
    };
    const change = event => {
        const field = event.target;
        const value = field.type === "checkbox" ? field.checked : field.type === "number" ? Number(field.value) : field.value;
        if (field.dataset.efield) {
            const card = field.closest("[data-effect-rule]"), rule = draft.effectRules[card.dataset.effectRule];
            if (field.dataset.efield === "amount") {
                const fixed = fixedEffectAmount(field.value);
                rule.amount = fixed ?? 0;
                rule.amountFormula = fixed === null ? String(field.value).trim() : "";
                const result = editorAmount(actor, rule);
                field.setCustomValidity?.(result.error);
                card.querySelector("[data-amount-preview]").textContent = amountPreview(actor, rule);
            } else {
                rule[field.dataset.efield] = field.dataset.efield === "addBefore" ? value === "yes" : value;
            }
            card.querySelector("[data-rule-summary]").textContent = effectRuleSummary(rule, { actor: summaryActor(actor) });
            if (field.dataset.efield === "activationMode") {
                rule.conditionMode = "selected";
                render();
            }
        } else if (field.dataset.ruleConditionId) {
            const card = field.closest("[data-effect-rule]"), rule = draft.effectRules[card.dataset.effectRule];
            const ids = new Set(rule.conditionIds ?? []);
            if (field.checked) ids.add(field.dataset.ruleConditionId);
            else ids.delete(field.dataset.ruleConditionId);
            rule.conditionIds = [...ids];
        } else if (field.dataset.draft) draft[field.dataset.draft] = value;
    };
    const click = event => {
        const button = event.target.closest("button");
        if (!button) return;
        if (button.dataset.effectTab) { tab = button.dataset.effectTab; render(); }
        else if (button.dataset.addEffect) { draft.effectRules[foundry.utils.randomID()] = newEffectRule(button.dataset.addEffect); render(); }
        else if (button.dataset.removeEffect) { delete draft.effectRules[button.dataset.removeEffect]; render(); }
        else if (button.dataset.duplicateEffect) { draft.effectRules[foundry.utils.randomID()] = copy(draft.effectRules[button.dataset.duplicateEffect]); render(); }
        else if (button.hasAttribute("data-add-condition")) { draft.conditions[foundry.utils.randomID()] = newCondition(); render(); }
        else if (button.dataset.removeCondition) { delete draft.conditions[button.dataset.removeCondition]; render(); }
    };
    dialog.addEventListener("render", render);
    return parent ? parent.renderChild(dialog) : dialog.render({ force: true });
}

export async function openCharacterEffectsManager(actor) {
    if (!actor.isOwner) return;
    const content = document.createElement("div");
    content.innerHTML = '<section class="aa-effects-editor" data-effect-manager></section>';
    const dialog = new foundry.applications.api.DialogV2({
        window: { title: `Effets permanents et avantages — ${actor.name}`, resizable: true },
        position: { width: 850, height: 760 }, content,
        buttons: [{ action: "close", label: "Fermer", default: true }]
    });
    const render = () => {
        const root = dialog.element.querySelector("[data-effect-manager]"), sources = characterEffectSources(actor), rules = activeCharacterEffects(actor);
        const rows = Object.entries(EFFECT_ABILITIES).flatMap(([key, label]) => [
            { label: `Test de ${label}`, type: "ability", ability: key }, { label: `JS de ${label}`, type: "save", ability: key }
        ]);
        for (const item of actor.items.filter(item => item.type === "skill")) rows.push({ label: item.name, type: "skill", ability: item.system.ability, skillId: item.id, skillName: item.name });
        rows.push({ label: "Initiative", type: "initiative", ability: "dexterity" }, { label: "Garde", type: "guard", ability: "strength" });
        rows.push({ label: "Attaque (FOR)", type: "attack", ability: "strength" }, { label: "Attaque (DEX)", type: "attack", ability: "dexterity" }, { label: "Contre-la-Mort", type: "death" });
        for (const [key, label] of Object.entries(EFFECT_ABILITIES)) rows.push({ label: `Aptitude (${label})`, type: "aptitude", abilities: [key] });
        root.innerHTML = `<div class="aa-effect-body"><p class="hint">Le mode manuel actuel de la fiche est pris en compte. Les sources opposées s'annulent : au moins un Avantage + au moins un Désavantage = Neutre.</p>
            <button type="button" data-manage-source="actor">Modifier les effets permanents du personnage</button>
            <details open><summary>Sources et activation</summary>${sources.map(({ source, active, rules }) => `<article class="aa-effect-card"><div class="aa-effect-card-heading"><strong>${escape(source.name)}</strong><span>${active ? "● Actif" : "○ Inactif"}</span><button type="button" data-manage-source="${escape(source.id)}">Modifier</button></div>
                ${rules.map(rule => `<p class="hint">${rule.enabled === false ? "Désactivé — " : ""}${escape(effectRuleSummary(rule, { actor: summaryActor(actor) }))}</p>`).join("") || '<p class="hint">Aucun effet configuré.</p>'}</article>`).join("")}</details>
            <details open><summary>Résultat actuel par jet</summary><table class="aa-effect-roll-summary"><thead><tr><th>Jet</th><th>Avantage</th><th>Désavantage</th><th>Résultat</th><th>Bonus</th></tr></thead><tbody>${rows.map(row => {
                const state = resolveRollEffects(rules, row, actor.system.rollMode);
                return `<tr><td>${escape(row.label)}</td><td>${state.advantage ? "Oui" : "—"}</td><td>${state.disadvantage ? "Oui" : "—"}</td><td>${{ normal: "Neutre", advantage: "Avantage", disadvantage: "Désavantage" }[state.mode]}</td><td>${state.bonus > 0 ? "+" : ""}${state.bonus}</td></tr>`;
            }).join("")}</tbody></table></details></div>`;
        root.onclick = async event => {
            const button = event.target.closest("[data-manage-source]");
            if (!button) return;
            const owner = button.dataset.manageSource === "actor" ? actor : actor.items.get(button.dataset.manageSource);
            if (!owner) return;
            const child = await openCharacterEffectsEditor(owner, { actor, parent: dialog });
            child?.addEventListener("close", render, { once: true });
        };
    };
    dialog.addEventListener("render", render);
    return dialog.render({ force: true });
}
