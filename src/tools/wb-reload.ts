import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import {
  RELOAD_CONFIRM_TIMEOUT_MS,
  RELOAD_CONFIRM_POLL_MS,
  type WorkbenchClient,
} from "../workbench/client.js";
import { formatConnectionStatus } from "../workbench/status.js";
import { sleep, renderError } from "../workbench/tool-helpers.js";
import { captureCompileLogCursor, readCompileLogSince } from "../workbench/compile-log.js";
import { formatCompileReport } from "./wb-compile-status.js";

/**
 * wb_reload — reload scripts or plugins in the running Workbench.
 *
 * Left hand-written (not migrated to defineWorkbenchTool, ADR-0007): the reload
 * drops the socket while Workbench recompiles, so the tool polls until the
 * connection comes back (RELOAD_CONFIRM_TIMEOUT_MS) and reports whether the
 * handshake was confirmed. That poll loop is the orchestration shape the
 * envelope's "guard → call(s) → format once → footer → catch" does not cover.
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
        await client.call<Record<string, unknown>>("EMCP_WB_Reload", { target });
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
        let back = false;
        try {
          // Refreshes `connected`; mode is unchanged by a reload.
          await client.call<Record<string, unknown>>("EMCP_WB_Ping");
          back = true;
        } catch {
          /* handlers still recompiling — keep polling */
        }
        if (back) {
          const compileReport = readCompileLogSince(config.workbenchProfile, logCursor);
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `**Reload Complete** — handlers back online.\n\n` +
                  `${formatCompileReport(compileReport)}${formatConnectionStatus(client)}`,
              },
            ],
          };
        }
        if (Date.now() >= deadline) break;
      }

      // Budget elapsed — handlers never returned. Almost always a script compile
      // error blocking recompilation. Soft-degrade, don't recover.
      client.markStale();
      const compileReport = readCompileLogSince(config.workbenchProfile, logCursor);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `**Reload Triggered** — handlers haven't come back online within ${RELOAD_CONFIRM_TIMEOUT_MS / 1000}s. ` +
              `This is likely a script compile error blocking recompilation.\n\n` +
              `${formatCompileReport(compileReport)}${formatConnectionStatus(client)}`,
          },
        ],
      };
    }
  );
}
