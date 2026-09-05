import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import {
  RELOAD_CONFIRM_TIMEOUT_MS,
  RELOAD_CONFIRM_POLL_MS,
  WorkbenchError,
  type WorkbenchClient,
} from "../workbench/client.js";
import { formatConnectionStatus } from "../workbench/status.js";
import { sleep, renderError } from "../workbench/tool-helpers.js";
import {
  captureCompileLogCursor,
  readCompileLogSince,
  type CompileLogReport,
} from "../workbench/compile-log.js";
import { formatCompileReport } from "./wb-compile-status.js";

type ReloadTarget = "scripts" | "plugins" | "both";

export function isReloadConfirmed(
  target: ReloadTarget,
  handlersBack: boolean,
  compileReport: Pick<CompileLogReport, "sawWorkbenchGameModule">
): boolean {
  return handlersBack && (target === "plugins" || compileReport.sawWorkbenchGameModule);
}

export function shouldProbeReloadHandler(
  target: ReloadTarget,
  compileReport: Pick<CompileLogReport, "sawWorkbenchGameModule" | "failed">
): boolean {
  return target === "plugins" || (compileReport.sawWorkbenchGameModule && !compileReport.failed);
}

export function isExpectedNativeReloadDisconnect(error: unknown): boolean {
  return (
    error instanceof WorkbenchError &&
    (error.code === "PROTOCOL_ERROR" || error.code === "TIMEOUT")
  );
}

/**
 * wb_reload — reload scripts or plugins in the running Workbench.
 *
 * Left hand-written (not migrated to defineWorkbenchTool, ADR-0007): the NET
 * API cannot reload its own script module safely: its handler/request/response
 * remain alive until serialization finishes. Script reload therefore uses the
 * engine's native ReloadScripts endpoint, which is not implemented in the
 * reloaded WorkbenchGame module. The native endpoint may close or outlive its
 * TCP request during teardown, so completion is established out-of-band from
 * a fresh compile marker and live handlers.
 */
export function registerWbReload(server: McpServer, config: Config, client: WorkbenchClient): void {
  server.registerTool(
    "wb_reload",
    {
      description:
        "Reload and compile scripts or plugins in the running Workbench, then return structured compile errors from Workbench's script.log. " +
        "Use after editing .c files; it does not require window focus and never launches another Workbench.",
      inputSchema: {
        target: z
          .enum(["scripts", "plugins", "both"])
          .default("scripts")
          .describe("What to reload: scripts, plugins, or both"),
      },
    },
    async ({ target }) => {
      const logCursor = captureCompileLogCursor(config.workbenchProfile);
      try {
        if (target === "plugins" || target === "both") {
          await client.call<Record<string, unknown>>("EMCP_WB_Reload", { target: "plugins" });
        }
        if (target === "scripts" || target === "both") {
          try {
            await client.call<Record<string, unknown>>("ReloadScripts");
          } catch (error) {
            if (!isExpectedNativeReloadDisconnect(error)) throw error;
          }
        }
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error reloading: ${renderError(e)}${formatConnectionStatus(client)}` }],
          isError: true,
        };
      }

      // A reload recompiles scripts INCLUDING the EnfusionMCP handlers, so the
      // handlers deliberately drop for a moment ("Undefined API func" window).
      // Wait for them to come back on their own — this is observing the user's
      // own recompile, NOT recovery (no reinstall/mutation), so it respects the
      // opt-in launch policy. We never call recoverMissingHandlers here.
      const deadline = Date.now() + RELOAD_CONFIRM_TIMEOUT_MS;
      for (;;) {
        await sleep(RELOAD_CONFIRM_POLL_MS);
        const compileReport = readCompileLogSince(config.workbenchProfile, logCursor);
        if (compileReport.failed) {
          client.markStale();
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `**Reload Failed** — Workbench reported a script compilation error.\n\n` +
                  `${formatCompileReport(compileReport)}${formatConnectionStatus(client)}`,
              },
            ],
            isError: true,
          };
        }
        let back = false;
        if (shouldProbeReloadHandler(target, compileReport)) {
          try {
            // Probe only after WorkbenchGame has rebuilt. Probing while the
            // handler class is absent writes one NET API error per poll.
            await client.call<Record<string, unknown>>("EMCP_WB_Ping");
            back = true;
          } catch {
            /* module finished but handlers are not registered yet */
          }
        }
        if (isReloadConfirmed(target, back, compileReport)) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `**Reload Complete** — native focus-free reload ran and handlers are back online.\n\n` +
                  `${formatCompileReport(compileReport)}${formatConnectionStatus(client)}`,
              },
            ],
          };
        }
        if (Date.now() >= deadline) break;
      }

      // Require a compile marker as well as a ping so a responsive handler from
      // before the native action cannot be mistaken for a completed reload.
      client.markStale();
      const compileReport = readCompileLogSince(config.workbenchProfile, logCursor);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `**Reload Unconfirmed** — no completed focus-free reload was observed within ${RELOAD_CONFIRM_TIMEOUT_MS / 1000}s. ` +
              `This can mean the native reload was rejected or a script compile error blocked handler reload.\n\n` +
              `${formatCompileReport(compileReport)}${formatConnectionStatus(client)}`,
          },
        ],
      };
    }
  );
}
