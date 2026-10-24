import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { basename, dirname, join, resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import type { Config } from "../config.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { formatConnectionStatus } from "../workbench/status.js";
import { normalizeOsPath } from "../utils/wsl-path.js";

/**
 * wb_launch — start Workbench (and provision the bridge plugin) from the MCP.
 *
 * Left hand-written (not migrated to defineWorkbenchTool, ADR-0007): it spawns a
 * process and touches the filesystem before any Workbench call exists to make,
 * then waits for the new instance to connect. Side effects and a wait loop, not
 * "guard → call(s) → format once → footer → catch".
 */
export function registerWbLaunch(
  server: McpServer,
  config: Config,
  client: WorkbenchClient
): void {
  server.registerTool(
    "wb_launch",
    {
      description:
        "Launch Arma Reforger Workbench (Arma Reforger Tools). Automatically copies handler scripts " +
        "into the target mod's Scripts/WorkbenchGame/ directory (so NET API handlers compile as part " +
        "of the mod), starts the Workbench executable, and waits for the NET API to become available. " +
        "Ordinary tools never launch Workbench. A running native endpoint with missing handlers is preserved; use wb_bridge for in-place installation. " +
        "IMPORTANT: Before publishing a mod, call wb_cleanup to remove the " +
        "handler scripts from the mod before the user publishes.",
      inputSchema: {
        gprojPath: z
          .string()
          .optional()
          .describe(
            "Path to a .gproj file to open directly. Skips the Workbench launcher screen and goes straight " +
            "into the World Editor. Handler scripts are copied into the mod so all wb_* tools work. " +
            "If omitted, Workbench opens to its launcher."
          ),
      },
    },
    async ({ gprojPath }) => {
      try {
        // Callers may pass a Windows path (D:\...) or a WSL path (/mnt/...).
        // Normalize to the WSL form so Node fs ops (handler-script copy, dirname)
        // resolve correctly; the client converts it back to a Windows path for
        // the exe's -gproj argument. No-op outside WSL.
        const wslGproj = gprojPath ? normalizeOsPath(gprojPath) : undefined;
        // The mod's root directory — reused for defaultMod and the cleanup note.
        const modDir = wslGproj ? dirname(resolve(wslGproj)) : null;

        const alreadyRunning = await client.ping();
        if (alreadyRunning) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Workbench Already Running** — NET API is responding. Use wb_projects to verify the loaded addon; the requested project has not been opened.${formatConnectionStatus(client)}`,
              },
            ],
          };
        }

        await client.ensureRunning(wslGproj);

        // Change defaults only after a successful explicit launch.
        if (modDir) config.defaultMod = basename(modDir);

        const note = modDir
          ? `\n\nNote: Handler scripts were copied to ${modDir}/Scripts/WorkbenchGame/EnfusionMCP/. ` +
            `Call **wb_cleanup** with the mod directory path when done to remove them before publishing.`
          : "";

        return {
          content: [
            {
              type: "text" as const,
              text: `**Workbench Ready** — Launched, handler scripts installed, NET API responding. All \`wb_*\` tools are available.${note}${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Launch Failed**\n\n${msg}${formatConnectionStatus(client)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Cleanup tool to remove handler scripts after Workbench work is done
  server.registerTool(
    "wb_cleanup",
    {
      description:
        "Remove temporary EnfusionMCP handler scripts from one mod or every detected addon. " +
        "Deletes only Scripts/WorkbenchGame/EnfusionMCP/ directories. " +
        "Call this after finishing Workbench work and before the user publishes their mod. " +
        "Safe to call even if scripts were never installed.",
      inputSchema: {
        modDir: z
          .string()
          .optional()
          .describe("Path to one mod root. Omit only when allInstalled is true."),
        allInstalled: z
          .boolean()
          .default(false)
          .describe("Remove injected handlers from every addon found under the configured project path."),
      },
    },
    async ({ modDir, allInstalled }) => {
      if (allInstalled) {
        const installed = client.listInstalledHandlerMods();
        const removed = installed.filter((entry) => client.cleanupHandlerScripts(entry.modDir));
        const detail = removed.length
          ? removed.map((entry) => `- ${entry.modDir}`).join("\n")
          : "No injected handler directories were found.";
        return {
          content: [{
            type: "text" as const,
            text: `**Bulk Cleanup Complete** — removed ${removed.length} handler installation(s).\n\n${detail}${formatConnectionStatus(client)}`,
          }],
        };
      }
      if (!modDir) {
        return {
          content: [{ type: "text" as const, text: "**Error:** Provide modDir or set allInstalled to true." }],
          isError: true,
        };
      }
      // Resolve to absolute path and validate. Normalize a Windows path to WSL
      // form first so the fs checks below resolve correctly. No-op outside WSL.
      const resolvedModDir = resolve(normalizeOsPath(modDir));
      if (!existsSync(resolvedModDir)) {
        return {
          content: [{
            type: "text" as const,
            text: `**Error:** Directory not found: ${modDir}${formatConnectionStatus(client)}`,
          }],
        isError: true,
        };
      }
      const hasGproj = readdirSync(resolvedModDir).some(f => f.endsWith(".gproj"));
      if (!hasGproj) {
        return {
          content: [{
            type: "text" as const,
            text: `**Error:** "${resolvedModDir}" does not appear to be a mod directory (no .gproj file found). Provide the mod root directory containing the .gproj file.${formatConnectionStatus(client)}`,
          }],
        isError: true,
        };
      }

      const removed = client.cleanupHandlerScripts(resolvedModDir);
      if (removed) {
        return {
          content: [
            {
              type: "text" as const,
              text: `**Cleanup Complete** — EnfusionMCP handler scripts removed from the mod. The mod is ready to publish.${formatConnectionStatus(client)}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `**No Cleanup Needed** — Handler scripts were not present in the mod directory.${formatConnectionStatus(client)}`,
          },
        ],
      };
    }
  );
}
