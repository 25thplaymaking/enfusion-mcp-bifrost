import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { readLatestCompileLog, type CompileDiagnostic, type CompileLogReport } from "../workbench/compile-log.js";

export function formatCompileReport(
  report: CompileLogReport,
  options: { includeWarnings?: boolean; maxDiagnostics?: number } = {}
): string {
  const includeWarnings = options.includeWarnings ?? false;
  const maxDiagnostics = options.maxDiagnostics ?? 50;
  const errors = report.diagnostics.filter((d) => d.severity === "error");
  const warnings = report.diagnostics.filter((d) => d.severity === "warning");
  const selected: CompileDiagnostic[] = includeWarnings ? report.diagnostics : errors;

  const lines: string[] = [];
  if (!report.logPath) {
    return "**Compile Status Unavailable** — Workbench has not created a script.log under the configured profile.";
  }
  if (!report.sawCompile) {
    lines.push("**No Recent Compile Block Found** — the latest bounded script.log tail contains no compile/reload marker.");
  } else if (report.failed || errors.length > 0) {
    lines.push(`**Compile Failed** — ${errors.length} error(s), ${warnings.length} warning(s).`);
  } else {
    lines.push(`**Compile Passed** — no script errors${warnings.length ? `; ${warnings.length} warning(s)` : ""}.`);
  }

  for (const diagnostic of selected.slice(0, maxDiagnostics)) {
    const location = diagnostic.file
      ? `\`${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}\``
      : "Workbench";
    lines.push(`- ${diagnostic.severity === "error" ? "ERROR" : "WARNING"} ${location} — ${diagnostic.message}`);
  }
  if (selected.length > maxDiagnostics) {
    lines.push(`- … ${selected.length - maxDiagnostics} additional diagnostic(s) omitted.`);
  }
  if (report.truncated) lines.push("- Log input was bounded to the newest 2 MB.");
  lines.push(`- Source: \`${report.logPath}\``);
  return lines.join("\n");
}

export function registerWbCompileStatus(server: McpServer, config: Config): void {
  server.registerTool(
    "wb_compile_status",
    {
      description:
        "Read the latest Workbench script compilation result from its authoritative script.log. " +
        "Returns file, line, severity, and message without launching, focusing, or modifying Workbench.",
      inputSchema: {
        includeWarnings: z.boolean().default(false).describe("Include warnings as well as errors."),
        maxDiagnostics: z.number().int().min(1).max(200).default(50),
      },
    },
    async ({ includeWarnings, maxDiagnostics }) => ({
      content: [{
        type: "text" as const,
        text: formatCompileReport(readLatestCompileLog(config.workbenchProfile), {
          includeWarnings,
          maxDiagnostics,
        }),
      }],
    })
  );
}
