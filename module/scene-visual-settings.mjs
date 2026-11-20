export const MIST_DEFAULTS = Object.freeze({
    enabled: true, color: "#b9c3ca", density: 0.65, speed: 1, softness: 0.3, scale: 1
});

const legacyMist = model => model.kind === "visualEffect" && !model.mist
    && ["fog", "smokepatch"].includes(model.light?.animation);

export function sceneMist(model) {
    if (model?.kind !== "visualEffect") return { ...MIST_DEFAULTS, enabled: false };
    if (model.mist) return { ...MIST_DEFAULTS, ...model.mist };
    if (!legacyMist(model)) return { ...MIST_DEFAULTS, enabled: false };
    return { ...MIST_DEFAULTS, enabled: Boolean(model.light.enabled),
        color: model.light.color ?? MIST_DEFAULTS.color,
        density: model.light.alpha ?? MIST_DEFAULTS.density,
        speed: (model.light.speed ?? 2) / 2 };
}

export function sceneLightEnabled(model) {
    // Older fog models used a light shader; convert their placed copies as well.
    return Boolean(model.light?.enabled && (!legacyMist(model) || model.light.negative));
}

export function migrateVisualMist(data) {
    if (!data.mist && typeof data.light?.enabled === "boolean" && typeof data.light.animation === "string") {
        data.mist = sceneMist({ ...data, kind: "visualEffect" });
        if (!data.light.negative && legacyMist({ ...data, mist: undefined, kind: "visualEffect" })) data.light.enabled = false;
    }
    return data;
}
