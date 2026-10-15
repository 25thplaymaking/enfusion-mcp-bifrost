/**
 * Repair method names in the scraped API index.
 *
 * parseClassPage() read the text of every link in a declaration cell, so any
 * parameter type that Doxygen linked was glued onto the method name:
 * `ActivateContext(string, int)` was indexed as `ActivateContextstringint`.
 * That hit 30,035 of 123,571 methods (two thirds of the engine API), and
 * api_search showed agents names that do not compile.
 *
 * The signature string was captured intact, so the true name is the
 * identifier before its "(". Only names that start with that identifier are
 * rewritten, which leaves destructors and anything unexpected alone.
 * Idempotent; preserves the files' line endings.
 *
 * Usage:  tsx scripts/repair-method-names.ts [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "api");
const check = process.argv.includes("--check");
const KINDS = ["methods", "staticMethods", "protectedMethods"] as const;

export function signatureName(signature: string): string | undefined {
  return signature.match(/([A-Za-z_]\w*)\s*\(/)?.[1];
}

let pending = 0;
for (const file of ["enfusion-classes.json", "arma-classes.json"]) {
  const path = resolve(dataDir, file);
  const text = readFileSync(path, "utf-8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const classes = JSON.parse(text) as Array<Record<string, any>>;
  let fixed = 0;
  for (const cls of classes) {
    for (const kind of KINDS) {
      for (const m of cls[kind] ?? []) {
        const real = typeof m.signature === "string" ? signatureName(m.signature) : undefined;
        if (real && m.name !== real && m.name.startsWith(real)) {
          m.name = real;
          fixed++;
        }
      }
    }
  }
  pending += fixed;
  console.log(`${file}: ${fixed} method name(s) ${check ? "need repair" : "repaired"}`);
  if (!check && fixed > 0) {
    writeFileSync(path, JSON.stringify(classes, null, 2).replace(/\n/g, eol), "utf-8");
  }
}
if (check && pending > 0) process.exit(1);
