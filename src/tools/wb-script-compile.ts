import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

interface ScriptDiagnostic {
  error?: string;
  file?: string;
  fileAbs?: string;
  addon?: string;
  line?: number;
}

interface ValidateScriptsResponse extends Record<string, unknown> {
  Success?: boolean;
  Errors?: ScriptDiagnostic[];
  Warnings?: ScriptDiagnostic[];
}

function diagnosticLine(diagnostic: ScriptDiagnostic, severity: "ERROR" | "WARNING"): string {
  const file = diagnostic.fileAbs || diagnostic.file || "Workbench";
  const location = diagnostic.line ? `${file}:${diagnostic.line}` : file;
  const addon = diagnostic.addon ? ` [${diagnostic.addon}]` : "";
  return `- ${severity} \`${location}\`${addon} — ${diagnostic.error || "Unknown diagnostic"}`;
}

const scriptCompileTool = defineWorkbenchTool({
  name: "wb_validate_scripts",
  description:
    "Run Workbench's built-in ValidateScripts NET API endpoint and return its structured success flag, errors, warnings, files, addons, and line numbers. This is the primary focus-free compiler/validator; wb_compile_status is the log-based fallback and history view.",
  inputSchema: {
    configuration: z.string().default("WORKBENCH").describe("Workbench script configuration, normally WORKBENCH"),
    includeWarnings: z.boolean().default(true),
    maxDiagnostics: z.number().int().min(1).max(500).default(100),
  },
  apiFunc: ({ configuration }, client) =>
    client.call<ValidateScriptsResponse>("ValidateScripts", { Configuration: configuration }, { timeout: 60_000 }),
  formatter: ({ result, input }) => {
    const errors = Array.isArray(result.Errors) ? result.Errors : [];
    const warnings = Array.isArray(result.Warnings) ? result.Warnings : [];
    const passed = result.Success === true && errors.length === 0;
    const diagnostics = [
      ...errors.map((d) => diagnosticLine(d, "ERROR")),
      ...(input.includeWarnings ? warnings.map((d) => diagnosticLine(d, "WARNING")) : []),
    ];
    const shown = diagnostics.slice(0, input.maxDiagnostics);
    const lines = [
      passed
        ? `**Script Validation Passed** — ${warnings.length} warning(s).`
        : `**Script Validation Failed** — ${errors.length} error(s), ${warnings.length} warning(s).`,
      `- Configuration: \`${input.configuration}\``,
      ...shown,
    ];
    if (diagnostics.length > shown.length) lines.push(`- … ${diagnostics.length - shown.length} additional diagnostic(s) omitted.`);
    return { text: lines.join("\n"), isError: !passed };
  },
});

export const scriptCompileTools: WorkbenchTool[] = [scriptCompileTool];
