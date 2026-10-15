import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(REPO, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * This repo's sources carry MIXED line endings — some files are all-CRLF, some
 * all-LF, and at least one (src/server.ts) is genuinely mixed. That matters
 * because a whole-file rewrite by an editor or patch tool silently normalises
 * every line, which turns a two-line change into a several-hundred-line diff and
 * buries the real edit in noise.
 *
 * This test does not forbid either convention. It records each source file's
 * current line-ending signature so an accidental normalisation shows up as a
 * failing test rather than as review noise.
 */
describe("source line-ending stability", () => {
  // Recorded from the working tree as of the wb_playbook addition. When you
  // intentionally reformat a file, update its entry here in the same commit.
  const KNOWN: Record<string, string> = {
    "server.ts": "mixed",
  };

  const signature = (abs: string): "crlf" | "lf" | "mixed" | "empty" => {
    const buf = readFileSync(abs);
    const crlf = buf.toString("latin1").split("\r\n").length - 1;
    const lf = buf.toString("latin1").split("\n").length - 1 - crlf;
    if (crlf === 0 && lf === 0) return "empty";
    if (lf === 0) return "crlf";
    if (crlf === 0) return "lf";
    return "mixed";
  };

  it("does not silently normalise a file's line endings", () => {
    const problems: string[] = [];
    for (const abs of walk(SRC)) {
      const rel = relative(SRC, abs).split("\\").join("/");
      const sig = signature(abs);
      const expected = KNOWN[rel];
      if (expected && sig !== expected) {
        problems.push(`${rel}: expected ${expected}, found ${sig} — a whole-file rewrite normalised it`);
      }
    }
    expect(
      problems,
      "Line-ending drift. Fix by restoring the original bytes and applying a targeted edit, " +
        "not by rewriting the file. If the reformat was intentional, update KNOWN."
    ).toEqual([]);
  });

  it("records server.ts as genuinely mixed so a normaliser is caught", () => {
    // The file that was actually damaged during the wb_playbook work: a patch
    // turned 124 CRLF + 24 LF into 149 CRLF.
    expect(signature(join(SRC, "server.ts"))).toBe("mixed");
  });
});
