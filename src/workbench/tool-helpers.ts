import { WorkbenchError } from "./client.js";

/** Resolve after `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Render an error for a tool response, preferring the classified connectivity
 * hint attached by WorkbenchClient.call() (see classifyCallFailure) over the
 * raw message.
 */
export function renderError(e: unknown): string {
  if (e instanceof WorkbenchError && e.hint) return e.hint;
  return e instanceof Error ? e.message : String(e);
}

let lifecycleTail: Promise<unknown> = Promise.resolve();

/**
 * Run a Workbench state transition (reload, play, stop, launch) after every
 * earlier one has settled. Agents routinely issue `wb_reload` + `wb_play` (or
 * `wb_stop` + `wb_reload` + `wb_play`) as parallel tool calls; overlapping
 * transitions made the native reload refuse with "Compilation failed" before
 * any compile ran, which agents then chased as a phantom script error.
 * Requests arrive in the order the agent issued them, so FIFO keeps its intent.
 */
export function withLifecycleLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lifecycleTail.then(() => fn());
  lifecycleTail = run.catch(() => undefined);
  return run;
}

/**
 * True when the user has granted standing permission for foreground-activating
 * editor operations (module/resource opens, menu actions), so a tool no longer
 * needs a per-call `allowForeground: true` acknowledgement. Set
 * `ENFUSION_ALLOW_FOREGROUND=1` (or `true`) in the MCP server's environment once.
 * Tools still honour an explicit per-call `allowForeground: true` when the flag
 * is absent, preserving the safe default for unauthorized servers.
 */
export function foregroundAuthorized(): boolean {
  const v = process.env.ENFUSION_ALLOW_FOREGROUND;
  return v === "1" || (v ?? "").toLowerCase() === "true";
}

