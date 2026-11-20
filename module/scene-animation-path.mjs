export function chooseAnimationPath({ start = null } = {}) {
    if (!canvas.ready) return Promise.resolve(null);
    const points = start ? [{ x: start.x, y: start.y }] : [];
    const view = canvas.app.view, stage = canvas.stage;
    const layer = new PIXI.Graphics();
    layer.eventMode = "none";
    canvas.interface.addChild(layer);
    let cursor = null, finished = false;
    const draw = () => {
        layer.clear();
        layer.lineStyle(3, 0xffd37c, 0.9);
        const all = cursor && points.length ? [...points, cursor] : points;
        if (all.length) {
            layer.moveTo(all[0].x, all[0].y);
            for (const point of all.slice(1)) layer.lineTo(point.x, point.y);
        }
        for (const point of points) layer.beginFill(0xffd37c).drawCircle(point.x, point.y, 5).endFill();
    };
    ui.notifications.info(start
        ? "Cliquez sur la destination. Ctrl + clic ajoute une étape. Échap ou clic droit annule."
        : "Cliquez sur le départ, puis sur l’arrivée. Ctrl + clic ajoute des étapes. Échap ou clic droit annule.");
    return new Promise(resolve => {
        const cleanup = () => { if (!layer.destroyed) layer.destroy(); };
        const end = result => {
            if (finished) return;
            finished = true;
            view.removeEventListener("pointerdown", click, true);
            view.removeEventListener("pointermove", move, true);
            document.removeEventListener("keydown", key, true);
            Hooks.off("canvasTearDown", tearDown);
            if (!result) cleanup();
            else draw();
            resolve(result ? { points: points.map(point => ({ ...point })), cleanup } : null);
        };
        const pointFor = event => canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
        const click = event => {
            if (![0, 2].includes(event.button)) return;
            event.preventDefault(); event.stopPropagation();
            if (event.button === 2) return end(false);
            const point = pointFor(event);
            const last = points.at(-1);
            if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1) return;
            if (points.length >= 64) { ui.notifications.warn("Le trajet est limité à 64 points."); return; }
            points.push({ x: point.x, y: point.y }); cursor = null; draw();
            if (points.length >= 2 && !event.ctrlKey) end(true);
        };
        const move = event => { cursor = pointFor(event); draw(); };
        const key = event => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); end(false); }
            if (event.key === "Backspace") {
                event.preventDefault(); event.stopPropagation();
                if (points.length > (start ? 1 : 0)) points.pop();
                draw();
            }
        };
        const tearDown = Hooks.on("canvasTearDown", () => end(false));
        view.addEventListener("pointerdown", click, true);
        view.addEventListener("pointermove", move, true);
        document.addEventListener("keydown", key, true);
        draw();
    });
}
