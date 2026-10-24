#!/usr/bin/env tsx
/**
 * Repair class inheritance in the API index from the game's own script source.
 *
 * The Doxygen-derived parents[] were wrong for many game classes (2026-10-11
 * measurement over 6,769 classes that have a script declaration): 2,564 had no
 * parent at all and 105 listed their own subclasses as parents (AIAgent ->
 * [AIAnimal, AIGroup]). api_search walks parents[0] for inherited members, so
 * those classes showed no inherited methods, or a child's methods.
 *
 * Truth here is every `class X : Y` declaration in the installed game's .c
 * files. Each class with one gets parents = [its nearest ancestor that exists
 * in the index]; the children[] lists of the old and new parents are updated to
 * match. Classes with no script declaration (pure native) are left alone.
 * Idempotent; preserves the files' line endings.
 *
 * USAGE   ENFUSION_GAME_PATH=... npx tsx scripts/repair-script-inheritance.ts [--check]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PakVirtualFS } from "../src/pak/vfs.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GAME = process.env.ENFUSION_GAME_PATH ?? "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Arma Reforger";
const FILES = ["enfusion-classes.json", "arma-classes.json"];

interface Cls { name: string; parents: string[]; children: string[] }

/** `class X : Y` / `class X extends Y` from script text, comments stripped. */
export function declaredParents(scriptText: string): Array<[string, string]> {
  const text = scriptText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...text.matchAll(/^\s*(?:sealed\s+)?class\s+(\w+)(?:\s*<[^>]*>)?\s*(?::|extends)\s*(\w+)/gm)].map((m) => [m[1], m[2]]);
}

function main(): void {
  const check = process.argv.includes("--check");
  const vfs = PakVirtualFS.get(GAME);
  if (!vfs || !existsSync(GAME)) {
    console.error(`Game data not found at ${GAME}. Set ENFUSION_GAME_PATH.`);
    process.exit(2);
  }

  const truth = new Map<string, string>();
  for (const p of vfs.allFilePaths()) {
    if (!p.toLowerCase().endsWith(".c")) continue;
    let text = "";
    try { text = vfs.readTextFile(p); } catch { continue; }
    for (const [cls, parent] of declaredParents(text)) if (cls !== parent) truth.set(cls, parent);
  }

  const docs = FILES.map((f) => {
    const path = resolve(REPO, "data", "api", f);
    const text = readFileSync(path, "utf-8");
    return { path, eol: text.includes("\r\n") ? "\r\n" : "\n", classes: JSON.parse(text) as Cls[], dirty: false };
  });
  const byName = new Map<string, { cls: Cls; doc: (typeof docs)[number] }>();
  for (const doc of docs) for (const cls of doc.classes) byName.set(cls.name, { cls, doc });

  const nearestIndexed = (name: string): string | undefined => {
    const seen = new Set<string>([name]);
    let cur = truth.get(name);
    while (cur && !seen.has(cur)) {
      if (byName.has(cur)) return cur;
      seen.add(cur);
      cur = truth.get(cur);
    }
    return undefined;
  };

  let changed = 0;
  for (const { cls, doc } of byName.values()) {
    const parent = nearestIndexed(cls.name);
    if (!parent || (cls.parents.length === 1 && cls.parents[0] === parent)) continue;
    for (const old of cls.parents) {
      const o = byName.get(old);
      if (o) { o.cls.children = o.cls.children.filter((c) => c !== cls.name); o.doc.dirty = true; }
    }
    cls.parents = [parent];
    const p = byName.get(parent)!;
    if (!p.cls.children.includes(cls.name)) { p.cls.children.push(cls.name); p.cls.children.sort(); p.doc.dirty = true; }
    doc.dirty = true;
    changed++;
  }

  console.log(`${truth.size} script class declarations; ${changed} class(es) ${check ? "need" : "got"} a corrected parent.`);
  if (check) { if (changed) process.exit(1); return; }
  for (const doc of docs) {
    if (doc.dirty) writeFileSync(doc.path, JSON.stringify(doc.classes, null, 2).replace(/\n/g, doc.eol), "utf-8");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
