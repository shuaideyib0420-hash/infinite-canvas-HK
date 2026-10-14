import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, "..");
async function files(dir) {
    return (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => entry.isDirectory() ? files(resolve(dir, entry.name)) : [resolve(dir, entry.name)]))).flat();
}
const version = (await readFile(resolve(root, "VERSION"), "utf8")).trim();
assert.equal((await readFile(resolve(web, "dist/VERSION"), "utf8")).trim(), version);
const registry = JSON.parse(await readFile(resolve(web, "dist/plugins/official-plugins.json"), "utf8"));
assert.deepEqual(registry.plugins.map((plugin) => plugin.id), ["markdown", "svg", "html", "panorama", "sticky-note"]);
for (const plugin of registry.plugins) {
    const compiled = await readFile(resolve(web, "dist/plugins", plugin.entry));
    assert(compiled.length > 100, "missing official plugin bytes");
}
for (const name of ["index", "features", "canvas-node-manual", "canvas-shortcuts", "codex-app-plugin", "local-codex-canvas"]) {
    const html = await readFile(resolve(web, "dist/help", name + ".html"), "utf8");
    assert(html.includes("Velumo"));
    for (const match of html.matchAll(/href="([^"#]+)"/g)) {
        if (/^(?:https?:|mailto:)/.test(match[1])) continue;
        const target = match[1].startsWith("/") ? resolve(web, "dist", "." + match[1]) : resolve(web, "dist/help", match[1]);
        const resolved = match[1].endsWith("/") ? resolve(target, "index.html") : target;
        await readFile(resolved);
    }
}
const forbidden = /github\.com\/basketikun\/infinite-canvas|canvas\.best|-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{20,}/;
for (const file of await files(resolve(web, "dist"))) {
    if (!/\.(?:js|html|md|json|ps1|txt)$/.test(file)) continue;
    assert(!forbidden.test(await readFile(file, "utf8")), "forbidden published link or credential pattern: " + relative(web, file));
}
assert((await readFile(resolve(web, "dist/licenses/infinite-canvas-MIT.txt"), "utf8")).includes("MIT License"));
console.log("PASS: final version, five official plugin files, six linked help chapters, MIT license and published-link/credential pattern scan.");
