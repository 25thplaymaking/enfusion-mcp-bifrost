import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { projectSchema, runProjectTool } from "../../src/tools/project.js";
import type { Config } from "../../src/config.js";

let root: string;
const call = (input: Record<string, unknown>) => runProjectTool(z.object(projectSchema).parse(input), { projectPath: root } as Config);
const data = (result: ReturnType<typeof call>) => result.structuredContent as Record<string, any>;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "enfusion-project-test-")); });
afterEach(() => {
  if (!resolve(root).startsWith(resolve(tmpdir()) + "/") && !resolve(root).startsWith(resolve(tmpdir()) + "\\")) throw new Error("Unexpected fixture root");
  rmSync(root, { recursive: true, force: true });
});

describe("project source access", () => {
  it.each(["acp", "ptc", "pap", "siga", "agr", "ast", "agf", "asi", "aw", "meta", "emat", "layout"])("reads and precisely edits %s sources", (ext) => {
    writeFileSync(join(root, `asset.${ext}`), "Root {\r\n value 1\r\n}\r\n");
    const read = call({ action: "read", path: `asset.${ext}` });
    expect(read.content[0].text).toContain("value 1");
    const edit = call({ action: "edit", path: `asset.${ext}`, oldText: "value 1", newText: "value 2", expectedSha256: data(read).sha256 });
    expect(data(edit).written).toBe(true);
    expect(readFileSync(join(root, `asset.${ext}`), "utf8")).toBe("Root {\r\n value 2\r\n}\r\n");
  });

  it("pages a large source with line numbers and continuation metadata", () => {
    writeFileSync(join(root, "large.c"), Array.from({ length: 10_000 }, (_, i) => `line${i + 1} ${"x".repeat(100)}`).join("\n"));
    expect(call({ action: "read", path: "large.c" }).isError).toBe(true);
    const result = call({ action: "read", path: "large.c", startLine: 9000, maxLines: 2 });
    expect(result.content[0].text).toContain("9000: line9000");
    expect(data(result)).toMatchObject({ startLine: 9000, endLine: 9001, nextLine: 9002, partial: true, totalLines: 10_000 });
  });

  it("rejects stale hashes and ambiguous replacements without changing bytes", () => {
    writeFileSync(join(root, "a.c"), "foo foo");
    expect(call({ action: "edit", path: "a.c", oldText: "foo", newText: "bar" }).isError).toBe(true);
    expect(call({ action: "edit", path: "a.c", oldText: "foo", newText: "bar", expectedMatches: 2, expectedSha256: "0".repeat(64) }).isError).toBe(true);
    expect(readFileSync(join(root, "a.c"), "utf8")).toBe("foo foo");
    expect(data(call({ action: "edit", path: "a.c", oldText: "foo", newText: "bar", expectedMatches: 2 })).replacements).toBe(2);
  });

  it("supports deletion, dry-run, empty writes and preserving a BOM", () => {
    writeFileSync(join(root, "a.c"), "\uFEFFabc\r\n");
    const preview = call({ action: "edit", path: "a.c", oldText: "abc", newText: "", dryRun: true });
    expect(data(preview).written).toBe(false);
    expect(readFileSync(join(root, "a.c"), "utf8")).toBe("\uFEFFabc\r\n");
    call({ action: "edit", path: "a.c", oldText: "abc", newText: "" });
    expect(readFileSync(join(root, "a.c"), "utf8")).toBe("\uFEFF\r\n");
    expect(data(call({ action: "write", path: "empty.c", content: "" })).written).toBe(true);
  });

  it("searches recursively with literal queries, extension filters and explicit truncation", () => {
    mkdirSync(join(root, "Scripts"));
    writeFileSync(join(root, "Scripts", "a.c"), "Hello [A]\nhello [A]\n");
    writeFileSync(join(root, "b.acp"), "Hello [A]");
    const result = call({ action: "search", query: "[a]", pattern: "*.c", maxResults: 1 });
    expect(data(result)).toMatchObject({ partial: true, stopReason: "result_limit" });
    expect(data(result).matches).toHaveLength(1);
    expect(data(result).matches[0].line).toBe(1);
    const complete = call({ action: "search", query: "hello", caseSensitive: true });
    expect(data(complete).partial).toBe(false);
    expect(data(complete).matches).toHaveLength(1);
  });

  it("does not treat inaccessible or non-UTF8 sources as a complete search", () => {
    writeFileSync(join(root, "bad.c"), Buffer.from([0xff, 0x00]));
    expect(data(call({ action: "search", query: "x" }))).toMatchObject({ partial: true, skippedCount: 1 });
    expect(call({ action: "read", path: "bad.c" }).isError).toBe(true);
  });

  it("rejects traversal and descendant directory junctions for reads and writes", () => {
    mkdirSync(join(root, "target"));
    symlinkSync(join(root, "target"), join(root, "link"), "junction");
    expect(call({ action: "write", path: "../escape.c", content: "x" }).isError).toBe(true);
    expect(call({ action: "write", path: "link/a.c", content: "x" }).isError).toBe(true);
    expect(data(call({ action: "search", query: "x" })).skippedCount).toBe(1);
  });
});
