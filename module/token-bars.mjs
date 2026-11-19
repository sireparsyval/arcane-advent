const SCOPE = "arcane-advent";
const RESOURCES = {
    consciousness: { setting: "tokenConsciousnessColor", label: "Points de Conscience", color: "#bd3737" },
    fever: { setting: "tokenFeverColor", label: "Points de Fièvre", color: "#f2c94c" }
};

function belowTokens() { return game.settings.get(SCOPE, "tokenBarsBelow"); }
function resourceStyle(attribute) {
    const resource = RESOURCES[attribute];
    if (!resource) return null;
    // ColorField settings return a Color instance; defaults may still be strings.
    const chosen = game.settings.get(SCOPE, resource.setting);
    return { ...resource, color: chosen?.css ?? chosen ?? resource.color };
}
function resourceBars(token) {
    // Foundry keeps these Graphics on the container as bar1/bar2 properties;
    // they are not named children and getChildByName therefore returns null.
    return ["bar1", "bar2"].map(name => token.bars?.[name])
        .filter(bar => bar?.visible && bar.height > 0);
}

// Extend the configured class, preserving Foundry's drawing, visibility and
// permissions. The layout only changes display positions, never resource data.
export function createArcaneTokenClass(BaseToken) {
    return class ArcaneToken extends BaseToken {
        _aaNameplateY = null;

        _getBarColors(index, data) {
            const resource = resourceStyle(data.attribute);
            if (!resource) return super._getBarColors(index, data);
            const color = foundry.utils.Color.fromString(resource.color);
            // Keep the chosen resource color at every fill level.
            return { empty: color, full: color };
        }

        _refreshSize() {
            super._refreshSize();
            this._aaNameplateY = this.nameplate?.y ?? null;
            this._layoutArcaneBars();
        }

        drawBars() {
            const result = super.drawBars();
            this._layoutArcaneBars();
            return result;
        }

        _layoutArcaneBars() {
            if (!this.bars || !this.nameplate) return;
            const { height } = this.document.getSize();
            const gap = 2 * (canvas.dimensions?.uiScale ?? 1);
            const baseline = this._aaNameplateY ?? height + gap;
            this.nameplate.y = baseline;
            if (!belowTokens()) return;
            const bars = resourceBars(this);
            let y = height + gap;
            for (const bar of bars) {
                bar.position.set(0, y);
                y += bar.height + gap;
            }
            if (bars.length) this.nameplate.y = Math.max(baseline, y + gap);
        }
    };
}

export function styleTokenHUD(app, html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || !app.document) return;
    root.classList.add("aa-token-resources");
    root.classList.toggle("aa-token-bars-below", Boolean(belowTokens()));
    for (const name of ["bar1", "bar2"]) {
        const field = root.querySelector(`.attribute.${name}`);
        if (!field) continue;
        const resource = resourceStyle(app.document.getBarAttribute(name)?.attribute);
        field.style.removeProperty("--aa-token-resource-color");
        if (!resource) continue;
        field.style.setProperty("--aa-token-resource-color", resource.color);
        const input = field.querySelector("input");
        if (input) {
            input.setAttribute("aria-label", resource.label);
            input.title = resource.label;
        }
    }
    // HUD controls use unscaled CSS pixels, while canvas bars use scene pixels.
    const token = app.object;
    if (token) {
        const { height } = app.document.getSize();
        const scale = canvas.dimensions?.uiScale ?? 1;
        const bottom = Math.max(height, ...resourceBars(token).map(bar => bar.y + bar.height),
            token.nameplate?.visible ? token.nameplate.y + token.nameplate.height : height);
        root.style.setProperty("--aa-token-resource-offset", `${(bottom - height) / scale + 6}px`);
    }
}

function refreshTokenBars() {
    if (!canvas?.ready) return;
    for (const token of canvas.tokens?.placeables ?? []) {
        // Update geometry before rebuilding an open HUD so its offset uses
        // the new bar layout rather than waiting for the next canvas frame.
        token.drawBars();
        token.renderFlags.set({ refreshBars: true, refreshNameplate: true });
    }
    const hud = canvas.hud?.token;
    if (hud?.rendered) hud.render({ force: true });
}

export function registerTokenBars() {
    game.settings.register(SCOPE, "tokenBarsBelow", {
        name: "Placer les deux barres sous les jetons",
        hint: "Empile les deux barres sous le jeton et décale le nom ainsi que les champs de saisie.",
        scope: "world", config: true, type: Boolean, default: true, onChange: refreshTokenBars
    });
    for (const resource of Object.values(RESOURCES)) {
        game.settings.register(SCOPE, resource.setting, {
            name: `Couleur des ${resource.label} sur les jetons`,
            hint: "Couleur de la barre et du champ de saisie sur la scène.",
            scope: "world", config: true,
            type: new foundry.data.fields.ColorField({ required: true, nullable: false, blank: false, initial: resource.color }),
            default: resource.color, onChange: refreshTokenBars
        });
    }
    CONFIG.Token.objectClass = createArcaneTokenClass(CONFIG.Token.objectClass);
    if (CONFIG.Token.documentClass) {
        const Base = CONFIG.Token.documentClass;
        CONFIG.Token.documentClass = class extends Base {
            getBarAttribute(...args) {
                const data = super.getBarAttribute(...args);
                const maximum = this.actor?.system?.[data?.attribute]?.effectiveMax;
                return data?.type === "bar" && RESOURCES[data.attribute] && Number.isFinite(maximum)
                    ? { ...data, max: maximum } : data;
            }
        };
    }
    Hooks.on("renderTokenHUD", styleTokenHUD);
}
