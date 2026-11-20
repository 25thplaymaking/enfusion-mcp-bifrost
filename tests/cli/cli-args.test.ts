import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  describeParams, positionalParams, parseToolArgs, validateInput, tokenize, nearest, reservedFlagCollisions, UsageError,
} from "../../src/cli-args.js";

const shape = {
  className: z.string().describe("Class name"),
  scriptType: z.enum(["modded", "component"]),
  methods: z.array(z.string()).optional(),
  max_files: z.number().int().min(1).max(5).default(2),
  dryRun: z.boolean().optional(),
  params: z.record(z.string()).optional(),
  align: z.union([z.string(), z.number()]).optional(),
  projectPath: z.string().optional(),
};
const params = describeParams(shape);
const parse = (words: string[]) => validateInput(shape, parseToolArgs(words, params));

describe("describeParams", () => {
  it("reads kind, required, default, enum values and descriptions from the zod shape", () => {
    const by = Object.fromEntries(params.map((p) => [p.name, p]));
    expect(by.className).toMatchObject({ kind: "string", required: true, description: "Class name" });
    expect(by.scriptType).toMatchObject({ kind: "enum", values: ["modded", "component"], required: true });
    expect(by.methods).toMatchObject({ kind: "array", item: "string", required: false });
    expect(by.max_files).toMatchObject({ kind: "integer", required: false, default: 2 });
    expect(by.params.kind).toBe("object");
    expect(by.align.kind).toBe("union");
  });

  it("bare values fill the required params in order, else a lone query", () => {
    expect(positionalParams(params)).toEqual(["className", "scriptType"]);
    expect(positionalParams(describeParams({ query: z.string().optional(), n: z.number().optional() }))).toEqual(["query"]);
    expect(positionalParams(describeParams({ n: z.number().optional() }))).toEqual([]);
  });
});

describe("parseToolArgs", () => {
  it("maps bare values, kebab and case-insensitive flags, and applies schema defaults", () => {
    expect(parse(["TAG_X", "component", "--project-path", "P:/m"])).toEqual({
      className: "TAG_X", scriptType: "component", projectPath: "P:/m", max_files: 2,
    });
    expect(parse(["TAG_X", "modded", "--MAX-FILES=3"]).max_files).toBe(3);
  });

  it("collects repeated flags into arrays and accepts a JSON array", () => {
    expect(parse(["A", "modded", "--methods", "void A()", "--methods", "void B()"]).methods).toEqual(["void A()", "void B()"]);
    expect(parse(["A", "modded", "--methods", '["x","y"]']).methods).toEqual(["x", "y"]);
  });

  it("handles booleans as bare flag, --no-flag, and explicit words", () => {
    expect(parse(["A", "modded", "--dry-run"]).dryRun).toBe(true);
    expect(parse(["A", "modded", "--no-dry-run"]).dryRun).toBe(false);
    expect(parse(["A", "modded", "--dryRun", "false"]).dryRun).toBe(false);
  });

  it("parses objects and unions from JSON, unions fall back to text", () => {
    expect(parse(["A", "modded", "--params", '{"k":"v"}']).params).toEqual({ k: "v" });
    expect(parse(["A", "modded", "--align", "2"]).align).toBe(2);
    expect(parse(["A", "modded", "--align", "Center"]).align).toBe("Center");
  });

  it("keeps a negative number as a value, and --x=--y for values that start with --", () => {
    const p = describeParams({ offset: z.number(), text: z.string().optional() });
    expect(parseToolArgs(["--offset", "-5", "--text=--raw"], p)).toEqual({ offset: -5, text: "--raw" });
  });

  it("merges a base object (from --args) under the flags", () => {
    expect(parseToolArgs(["--max-files", "4"], params, { className: "A", max_files: 1 })).toEqual({ className: "A", max_files: 4 });
  });

  it("treats a single array value as JSON only when it is a JSON array", () => {
    const sig = "[RplRpc(RplChannel.Reliable, RplRcver.Server)] void RpcAsk_Fire()";
    expect(parse(["A", "modded", "--methods", sig]).methods).toEqual([sig]);
    expect(parse(["A", "modded", "--methods", '["a"]']).methods).toEqual(["a"]);
  });

  it("rejects unknown keys in the --args base, with a suggestion", () => {
    expect(() => parseToolArgs([], params, { className: "A", maxFile: 1 })).toThrow(/Unknown key "maxFile" in --args\. Did you mean "max_files"\?/);
  });

  it("keeps a nullable-but-not-optional param required", () => {
    const p = describeParams({ target: z.string().nullable(), note: z.string().nullable().optional() });
    expect(p.map((x) => x.required)).toEqual([true, false]);
    expect(positionalParams(p)).toEqual(["target"]);
  });

  it("flags tool params that collide with the CLI's global options", () => {
    expect(reservedFlagCollisions(["query", "json", "args_file", "Help", "projectPath"])).toEqual(["json", "args_file", "Help"]);
  });

  it("fails loudly, with the fix in the message", () => {
    const fails = (words: string[], re: RegExp) => {
      expect(() => parse(words)).toThrow(UsageError);
      expect(() => parse(words)).toThrow(re);
    };
    fails(["A", "modded", "--maxfile", "1"], /Unknown flag --maxfile\. Did you mean --max_files\?/);
    fails(["A", "banana"], /must be one of: modded, component/);
    fails(["A", "modded", "--max-files", "two"], /expects a number/);
    fails(["A", "modded", "--max-files", "1.5"], /whole number/);
    fails(["A", "modded", "--max-files", "9"], /--max_files: Number must be less than or equal to 5/);
    fails(["A", "modded", "extra"], /takes 2 bare value\(s\): className, scriptType/);
    fails(["A"], /--scriptType: Required/);
    fails(["A", "modded", "--project-path"], /needs a value/);
    fails(["A", "modded", "--params", "{bad"], /expects an object as JSON/);
    fails(["A", "modded", "--project-path", "x", "--project-path", "y"], /given 2 times/);
  });
});

describe("tokenize", () => {
  it("splits on whitespace and honours quotes", () => {
    expect(tokenize(`wb_knowledge "weapon suppressor" --section 'Muzzle FX' --x=""`)).toEqual(
      ["wb_knowledge", "weapon suppressor", "--section", "Muzzle FX", "--x="],
    );
    expect(tokenize(`a "say \\"hi\\""`)).toEqual(["a", 'say "hi"']);
    expect(tokenize(`a ""`)).toEqual(["a", ""]);
    expect(() => tokenize(`a "open`)).toThrow(/Unclosed/);
  });
});

describe("nearest", () => {
  it("suggests close spellings and containing names", () => {
    expect(nearest("wb_knowlege", ["wb_knowledge", "wb_playbook", "api_search"])).toEqual(["wb_knowledge"]);
    expect(nearest("name", ["className", "scriptType"])).toEqual(["className"]);
    expect(nearest("zzzz", ["className"])).toEqual([]);
  });
});
