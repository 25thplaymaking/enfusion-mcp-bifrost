import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const validateTool = defineWorkbenchTool({
  name: "wb_validate",
  description:
    "Validate a material or texture resource using the Workbench's built-in validators. Returns validation errors and warnings.",
  inputSchema: {
    action: z
      .enum(["material", "texture"])
      .describe("Validator to run: material or texture"),
    path: z
      .string()
      .describe("Resource path to validate (e.g., 'Materials/MyMat.emat', 'Textures/MyTex.edds')"),
  },
  apiFunc: ({ action, path }, client) => {
    return client.call<Record<string, unknown>>("EMCP_WB_Resources", { action: action === "material" ? "validateMaterial" : "validateTexture", path });
  },
  formatter: ({ result, input }) => {
    const { action, path } = input;
    const reports = result.reports;
    const severity = result.severity;
    const native = Array.isArray(reports) && Array.isArray(severity) && reports.length === severity.length
      && reports.every(r => typeof r === "string") && severity.every(s => Number.isInteger(s) && Number(s) >= 0 && Number(s) <= 3);
    const known = native || typeof result.valid === "boolean" || typeof result.success === "boolean";
    if (!known) return { text: "Validation unconfirmed: unrecognized native response. " + JSON.stringify(result), isError: true };
    const valid = native ? !severity.some(s => Number(s) >= 3)
      : (result.valid === true || result.success === true) && result.valid !== false && result.success !== false;
    const errors = native ? reports.filter((_r, i) => Number(severity[i]) >= 3) : Array.isArray(result.errors) ? result.errors : [];
    const warnings = native ? reports.filter((_r, i) => Number(severity[i]) < 3) : Array.isArray(result.warnings) ? result.warnings : [];

    const lines: string[] = [];
    const label = action === "material" ? "Material" : "Texture";

    if (valid && errors.length === 0) {
      lines.push(`**${label} Validation Passed**\n`);
      lines.push(`- **Path:** ${path}`);
      lines.push(`- **Status:** Valid`);
    } else {
      lines.push(`**${label} Validation Failed**\n`);
      lines.push(`- **Path:** ${path}`);
      lines.push(`- **Status:** Invalid`);
    }

    if (errors.length > 0) {
      lines.push(`\n### Errors (${errors.length})`);
      for (const err of errors) {
        if (typeof err === "string") {
          lines.push(`- ${err}`);
        } else {
          const e = err as Record<string, unknown>;
          lines.push(`- ${e.message || JSON.stringify(e)}`);
        }
      }
    }

    if (warnings.length > 0) {
      lines.push(`\n### Warnings (${warnings.length})`);
      for (const warn of warnings) {
        if (typeof warn === "string") {
          lines.push(`- ${warn}`);
        } else {
          const w = warn as Record<string, unknown>;
          lines.push(`- ${w.message || JSON.stringify(w)}`);
        }
      }
    }

    // Include any extra info from the response
    if (result.info) {
      lines.push(`\n### Info`);
      lines.push(typeof result.info === "string" ? result.info : JSON.stringify(result.info, null, 2));
    }

    return { text: lines.join("\n"), isError: !valid || errors.length > 0 };
  },
});

/** The material/texture validator tool, migrated to the envelope. */
export const validateTools: WorkbenchTool[] = [validateTool];
