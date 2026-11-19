import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const browser = [process.env.BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]
    .find(path => path && existsSync(path));

test("inventory dialogs, token HUD, aptitude targeting and defense tooltips in a browser", {
    skip: browser ? false : "Set BROWSER_PATH to a Chromium browser to run the DOM regression tests",
    timeout: 45000
}, async () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const server = createServer(async (request, response) => {
        if (request.url === "/") {
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end('<!doctype html><meta charset="utf-8"><body><main></main><pre></pre><script type="module" src="/tests/browser/inventory-dialogs.mjs"></script></body>');
            return;
        }
        try {
            const path = resolve(root, decodeURIComponent(request.url.slice(1)));
            if (!path.startsWith(resolve(root) + sep) || !/\.(mjs|css|hbs)$/.test(path)) throw Error("Invalid path");
            response.setHeader("Content-Type", path.endsWith(".css") ? "text/css; charset=utf-8"
                : path.endsWith(".hbs") ? "text/plain; charset=utf-8" : "text/javascript; charset=utf-8");
            response.end(await readFile(path));
        } catch { response.statusCode = 404; response.end(); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const prefix = join(tmpdir(), "aa-dialog-tests-");
    const profile = await mkdtemp(prefix);
    try {
        const { stdout } = await promisify(execFile)(browser, ["--headless", "--disable-gpu",
            "--no-first-run", "--disable-background-networking", `--user-data-dir=${profile}`,
            "--dump-dom", "--virtual-time-budget=5000", `http://127.0.0.1:${server.address().port}/`],
        { windowsHide: true, timeout: 35000, maxBuffer: 1024 * 1024 });
        assert.match(stdout, /data-status="passed"/, stdout);
        const results = JSON.parse(stdout.match(/<pre>(.*?)<\/pre>/s)[1]);
        assert.equal(results.length, 25);
        assert.ok(results.every(result => result.passed), JSON.stringify(results));
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        // Only remove the profile created by this test under the OS temp folder.
        if (resolve(profile).startsWith(resolve(prefix))) {
            await rm(profile, { recursive: true, force: true, maxRetries: 3 });
        }
    }
});
