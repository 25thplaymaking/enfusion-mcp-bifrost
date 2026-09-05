import { describe, it, expect } from "vitest";
import { validateTools } from "../../src/tools/wb-validate.js";

const t = validateTools[0];

describe("wb_validate — exported data seam", () => {
  it("exports a single tool named wb_validate with no guard", () => {
    expect(validateTools.map((e) => e.name)).toEqual(["wb_validate"]);
    expect(t.requireMode).toBeUndefined();
    expect(t.validate).toBeUndefined();
  });
});

describe("wb_validate — formatter", () => {
  it("renders a passing material validation", () => {
    const { text } = t.formatter({
      result: { valid: true, errors: [], warnings: [] },
      input: { action: "material", path: "Materials/M.emat" },
    });
    expect(text).toContain("**Material Validation Passed**");
    expect(text).toContain("- **Path:** Materials/M.emat");
    expect(text).toContain("- **Status:** Valid");
  });

  it("treats a missing valid flag as unconfirmed", () => {
    const { text, isError } = t.formatter({
      result: {},
      input: { action: "texture", path: "Textures/T.edds" },
    });
    expect(text).toContain("Validation unconfirmed");
    expect(isError).toBe(true);
  });

  it("reads native report/severity arrays and rejects malformed native reports", () => {
    const input = { action: "material", path: "M.emat" };
    expect(t.formatter({ input, result: { reports: [], severity: [] } }).isError).toBe(false);
    expect(t.formatter({ input, result: { reports: ["bad GUID"], severity: [3] } }).isError).toBe(true);
    expect(t.formatter({ input, result: { reports: ["warning"], severity: [1] } }).isError).toBe(false);
    expect(t.formatter({ input, result: { reports: ["missing severity"], severity: [] } }).isError).toBe(true);
  });

  it("rejects contradictory legacy success flags", () => {
    const input = { action: "material", path: "M.emat" };
    for (const result of [{ valid: false, success: true }, { valid: true, success: false }]) {
      expect(t.formatter({ input, result }).isError).toBe(true);
    }
  });

  it("renders a failing validation with error and warning lists", () => {
    const { text } = t.formatter({
      result: {
        valid: false,
        errors: ["missing channel", { message: "bad ref" }],
        warnings: [{ message: "unused" }, "loose"],
      },
      input: { action: "material", path: "Materials/Bad.emat" },
    });
    expect(text).toContain("**Material Validation Failed**");
    expect(text).toContain("- **Status:** Invalid");
    expect(text).toContain("### Errors (2)");
    expect(text).toContain("- missing channel");
    expect(text).toContain("- bad ref");
    expect(text).toContain("### Warnings (2)");
    expect(text).toContain("- unused");
    expect(text).toContain("- loose");
  });

  it("marks valid=true but non-empty errors as failed", () => {
    const { text } = t.formatter({
      result: { valid: true, errors: ["still broken"] },
      input: { action: "material", path: "Materials/M.emat" },
    });
    expect(text).toContain("**Material Validation Failed**");
  });

  it("appends extra info when present", () => {
    const { text } = t.formatter({
      result: { valid: true, info: "compiled in 3ms" },
      input: { action: "texture", path: "Textures/T.edds" },
    });
    expect(text).toContain("### Info");
    expect(text).toContain("compiled in 3ms");
  });
});
