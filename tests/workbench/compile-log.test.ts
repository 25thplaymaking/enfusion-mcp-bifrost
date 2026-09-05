import { describe, expect, it } from "vitest";
import { parseCompileLog } from "../../src/workbench/compile-log.js";
import { formatCompileReport } from "../../src/tools/wb-compile-status.js";

describe("Workbench compile log parsing", () => {
  it("extracts, locates, and deduplicates real Workbench compile errors", () => {
    const report = parseCompileLog(`
14:34:48.243 SCRIPT       : Reloading game scripts
14:35:09.612 SCRIPT       : Compiling Game scripts
14:35:10.200 SCRIPT       : Module: WorkbenchGame; loaded 191x files; 686x classes
14:35:10.382 SCRIPT    (E): @"Scripts/Game/DCO/Test.c,199": Broken expression (missing ';'?)
14:35:10.382 SCRIPT    (E): @"Scripts/Game/DCO/Test.c,199": Broken expression (missing ';'?)
14:35:10.383 SCRIPT    (E): Can't compile "Game" script module!
Scripts/Game/DCO/Test.c(199): Broken expression (missing ';'?)
`, "C:\\logs\\script.log");

    expect(report.sawCompile).toBe(true);
    expect(report.sawWorkbenchGameModule).toBe(true);
    expect(report.failed).toBe(true);
    expect(report.diagnostics).toEqual([
      {
        severity: "error",
        file: "Scripts/Game/DCO/Test.c",
        line: 199,
        message: "Broken expression (missing ';'?)",
      },
    ]);
  });

  it("reports a clean compile and keeps warnings optional", () => {
    const report = parseCompileLog(`
12:54:40.116 SCRIPT : Compiling GameLib scripts
12:54:41.147 SCRIPT : Compiling Game scripts
12:54:41.148 SCRIPT (W): @"Scripts/Game/Old.c,7": 'OldMethod' is obsolete
`, "C:\\logs\\script.log");
    expect(report.failed).toBe(false);
    expect(report.sawWorkbenchGameModule).toBe(false);
    expect(formatCompileReport(report)).toContain("Compile Passed");
    expect(formatCompileReport(report)).not.toContain("OldMethod");
    expect(formatCompileReport(report, { includeWarnings: true })).toContain("OldMethod");
  });
});
