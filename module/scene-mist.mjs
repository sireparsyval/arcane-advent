import { sceneMist } from "./scene-visual-settings.mjs";
import { sceneObjectPosition } from "./scene-projectiles.mjs";

// Premultiplied alpha, rendered in the primary scene group before lighting and vision.
// A normal alpha blend covers the map; it never adds light or reveals unexplored terrain.
export const MIST_FRAGMENT = `
    uniform float aaTime;
    uniform float aaDensity;
    uniform float aaSoftness;
    uniform float aaScale;
    uniform vec3 aaColor;

    float aaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float aaNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(aaHash(cell), aaHash(cell + vec2(1.0, 0.0)), f.x),
                   mix(aaHash(cell + vec2(0.0, 1.0)), aaHash(cell + vec2(1.0)), f.x), f.y);
    }
    float aaCloud(vec2 p) {
        float n = 0.0, weight = 0.55;
        for (int i = 0; i < 4; i++) {
            n += weight * aaNoise(p);
            p = p * 2.03 + vec2(7.7, 4.3);
            weight *= 0.5;
        }
        return n;
    }
    vec4 _main() {
        vec2 uv = vUvs * 2.0 - 1.0;
        float edge = 1.0 - smoothstep(1.0 - aaSoftness, 1.0, length(uv));
        vec2 p = uv * (3.0 / aaScale);
        vec2 flow = vec2(aaCloud(p + vec2(aaTime * 0.12, 0.0)),
                         aaCloud(p + vec2(3.0, -aaTime * 0.09)));
        float cloud = aaCloud(p + flow * 1.5 + vec2(aaTime * 0.07, -aaTime * 0.04));
        float opacity = clamp(aaDensity * (0.35 + cloud * 0.9), 0.0, 1.0) * edge * tintAlpha.a;
        vec3 color = aaColor * (0.8 + cloud * 0.3);
        return vec4(color * opacity, opacity);
    }
`;

export function mistAppearance(tile, levelId) {
    const model = tile?.getFlag?.("arcane-advent", "sceneObject") ?? tile?.flags?.["arcane-advent"]?.sceneObject;
    const mist = sceneMist(model);
    if (!mist.enabled || !model.active || tile.hidden || (tile.levels?.size && !tile.levels.has(levelId))) return null;
    const color = /^#[0-9a-f]{6}$/i.test(mist.color) ? mist.color : "#b9c3ca";
    const value = Number.parseInt(color.slice(1), 16);
    return {
        ...sceneObjectPosition(tile), diameter: Math.max(tile.width, tile.height),
        elevation: tile.elevation, rotation: tile.rotation ?? 0, opacity: tile.alpha ?? 1,
        density: mist.density, softness: mist.softness, scale: mist.scale, speed: mist.speed,
        color: [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255]
    };
}

export function registerSceneMist() {
    const views = new Map();
    let MistMesh, MistShader;
    function classes() {
        if (MistShader) return;
        const { PrimaryBaseSamplerShader } = foundry.canvas.rendering.shaders;
        MistShader = class extends PrimaryBaseSamplerShader {
            static classPluginName = null;
            static pausable = false;
            static _fragmentShader = MIST_FRAGMENT;
            static get defaultUniforms() {
                return { ...super.defaultUniforms, aaTime: 0, aaDensity: 0.65,
                    aaSoftness: 0.3, aaScale: 1, aaColor: [0.73, 0.76, 0.79] };
            }
            _preRender(mesh, renderer) {
                super._preRender(mesh, renderer);
                this.uniforms.aaTime = canvas.app.ticker.lastTime / 1000 * mesh.mistSpeed;
            }
        };
        MistMesh = class extends foundry.canvas.primary.PrimarySpriteMesh {
            // White source texture is only a shader support, never an opaque surface.
            _shouldRenderDepth() { return false; }
        };
    }
    function remove(id) {
        const mesh = views.get(id);
        views.delete(id);
        if (mesh && !mesh.destroyed) mesh.destroy({ children: true, texture: false, baseTexture: false });
    }
    function refresh(tile) {
        if (!canvas.ready || tile.parent.id !== canvas.scene?.id) return;
        const appearance = mistAppearance(tile, canvas.level?.id);
        if (!appearance) return remove(tile.id);
        classes();
        let mesh = views.get(tile.id);
        if (!mesh || mesh.destroyed) {
            mesh = new MistMesh({ texture: PIXI.Texture.WHITE, shaderClass: MistShader, name: "aa-mist-" + tile.id });
            mesh.anchor.set(0.5);
            mesh.eventMode = "none";
            mesh.hoverFade = false;
            mesh.blendMode = PIXI.BLEND_MODES.NORMAL;
            mesh.sortLayer = foundry.canvas.groups.PrimaryCanvasGroup.SORT_LAYERS.WEATHER;
            canvas.primary.addChild(mesh);
            views.set(tile.id, mesh);
        }
        mesh.position.set(appearance.x, appearance.y);
        mesh.width = mesh.height = appearance.diameter;
        mesh.elevation = appearance.elevation;
        mesh.rotation = appearance.rotation * Math.PI / 180;
        mesh.alpha = appearance.opacity;
        mesh.mistSpeed = appearance.speed;
        Object.assign(mesh.shader.uniforms, {
            aaColor: appearance.color, aaDensity: appearance.density,
            aaSoftness: appearance.softness, aaScale: appearance.scale
        });
    }
    const clear = () => { for (const id of [...views.keys()]) remove(id); };
    Hooks.on("canvasReady", () => {
        clear();
        for (const tile of canvas.scene.tiles) refresh(tile);
    });
    Hooks.on("canvasTearDown", clear);
    Hooks.on("arcaneAdventSceneObjectPosition", (tile, point) => {
        if (tile.parent.id === canvas.scene?.id) views.get(tile.id)?.position.set(point.x, point.y);
    });
    for (const event of ["createTile", "updateTile"]) Hooks.on(event, refresh);
    Hooks.on("deleteTile", tile => {
        if (tile.parent.id === canvas.scene?.id) remove(tile.id);
    });
}
