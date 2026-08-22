#!/usr/bin/env node

import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

function fail(message) {
    console.error(`[enfusion-mcp] Wiki update refused: ${message}`);
    process.exit(1);
}

function loadJson(path, label) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch (error) {
        fail(`${label} is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
    }
}

const captureArg = process.argv[2];
if (!captureArg)
    fail("pass the official browser capture path as the first argument.");

const capturePath = resolve(captureArg);
if (!existsSync(capturePath))
    fail(`capture not found: ${capturePath}`);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..", "..");
const wikiDir = resolve(packageRoot, "data", "wiki");
const pagesPath = resolve(wikiDir, "pages.json");
const metadataPath = resolve(wikiDir, "metadata.json");
const capture = loadJson(capturePath, "capture");

if (capture.schemaVersion !== 1)
    fail(`unsupported capture schema ${capture.schemaVersion}.`);
if (!Array.isArray(capture.pages) || capture.pages.length < 200)
    fail(`capture is unexpectedly small (${capture.pages?.length ?? 0} pages).`);
if (capture.officialCount !== capture.pages.length)
    fail(`official count ${capture.officialCount} does not match ${capture.pages.length} captured pages.`);

const seen = new Set();
for (const [index, page] of capture.pages.entries()) {
    if (!page || page.source !== "bistudio-wiki")
        fail(`page ${index} has an invalid source.`);
    if (typeof page.title !== "string" || page.title.trim().length === 0)
        fail(`page ${index} has no title.`);
    if (seen.has(page.title))
        fail(`duplicate title: ${page.title}`);
    seen.add(page.title);
    if (typeof page.content !== "string" || page.content.trim().length < 20)
        fail(`page '${page.title}' has no usable content.`);
    if (typeof page.url !== "string" || !page.url.startsWith("https://community.bistudio.com/wiki/"))
        fail(`page '${page.title}' has an invalid official URL.`);
}

const existing = existsSync(pagesPath) ? loadJson(pagesPath, "installed pages") : [];
if (!Array.isArray(existing))
    fail("installed pages.json is not an array.");

const preserved = existing.filter(page => page?.source !== "bistudio-wiki");
const merged = [...capture.pages, ...preserved];
const newestRevision = capture.pages
    .map(page => page.revisionTimestamp || "")
    .filter(Boolean)
    .sort()
    .at(-1) || null;

mkdirSync(wikiDir, { recursive: true });
const backupDir = resolve(tmpdir(), "enfusion-mcp-wiki-backup");
mkdirSync(backupDir, { recursive: true });
if (existsSync(pagesPath))
    copyFileSync(pagesPath, resolve(backupDir, "pages.json"));
if (existsSync(metadataPath))
    copyFileSync(metadataPath, resolve(backupDir, "metadata.json"));

const pagesTemp = `${pagesPath}.tmp`;
const metadataTemp = `${metadataPath}.tmp`;
const metadata = {
    schemaVersion: 1,
    source: capture.source,
    namespace: capture.namespace,
    capturedAt: capture.capturedAt,
    installedAt: new Date().toISOString(),
    officialPageCount: capture.pages.length,
    preservedDoxygenPageCount: preserved.length,
    totalPageCount: merged.length,
    newestRevision,
};

try {
    writeFileSync(pagesTemp, JSON.stringify(merged, null, 2), "utf8");
    writeFileSync(metadataTemp, JSON.stringify(metadata, null, 2) + "\n", "utf8");
    renameSync(pagesTemp, pagesPath);
    renameSync(metadataTemp, metadataPath);
}
catch (error) {
    rmSync(pagesTemp, { force: true });
    rmSync(metadataTemp, { force: true });
    fail(`atomic install failed (${error instanceof Error ? error.message : String(error)}).`);
}

console.log(`[enfusion-mcp] Wiki corpus updated: ${capture.pages.length} official + ${preserved.length} Doxygen = ${merged.length} pages.`);
console.log(`[enfusion-mcp] Newest official revision: ${newestRevision ?? "unknown"}.`);
console.log(`[enfusion-mcp] Previous corpus backup: ${backupDir}`);
