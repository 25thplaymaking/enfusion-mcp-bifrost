import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, statSync, utimesSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../config.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { formatConnectionStatus } from "../workbench/status.js";
import { foregroundAuthorized, renderError, sleep } from "../workbench/tool-helpers.js";

/**
 * wb_anim_preview / wb_txa_compile — show an animation clip in the Animation Editor and build TXA into .anm.
 *
 * Left hand-written (not defineWorkbenchTool, ADR-0007): the preview spawns one bounded, hidden PowerShell
 * process (data/windows/wb-anim-preview.ps1) that reads the editor through UI Automation, writes through UIA
 * values or posted window messages and captures with PrintWindow, so nothing takes focus or the real mouse.
 * The TXA build waits on the file system for Workbench's resource builder.
 */

const VIEWS = ["Perspective", "Top", "Bottom", "Front", "Back", "Right", "Left"] as const;

function powershellPath(): string {
  return join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
}

export interface PreviewArgs {
  clip?: string;
  column?: string;
  frame?: number;
  playback?: "play" | "pause";
  view?: (typeof VIEWS)[number];
  zoom?: number;
  cube?: [number, number];
  out?: string;
  target?: "viewport" | "editor";
}

/** Build the PowerShell argument list for the preview script (exported for tests). */
export function previewScriptArgs(script: string, port: number, a: PreviewArgs): string[] {
  const args = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Port", String(port)];
  if (a.clip) args.push("-Clip", a.clip);
  if (a.column) args.push("-Column", a.column);
  if (a.frame !== undefined) args.push("-Frame", String(a.frame));
  if (a.playback) args.push("-Playback", a.playback);
  if (a.view) args.push("-View", a.view);
  if (a.zoom) args.push("-Zoom", String(a.zoom));
  if (a.cube) args.push("-CubeX", String(a.cube[0]), "-CubeY", String(a.cube[1]));
  if (a.out) args.push("-Out", a.out, "-Target", a.target ?? "viewport");
  return args;
}

/** Parse the frame count and fps from a TXA header (exported for tests). */
export function readTxaHeader(text: string): { fps?: number; numFrames?: number } {
  const fps = /#fps\s+(\d+)/.exec(text);
  const n = /#numFrames\s+(\d+)/.exec(text);
  return { fps: fps ? Number(fps[1]) : undefined, numFrames: n ? Number(n[1]) : undefined };
}

export function registerWbAnimPreview(server: McpServer, config: Config, client: WorkbenchClient): void {
  server.registerTool(
    "wb_anim_preview",
    {
      description:
        "Show an animation clip in the Workbench Animation Editor on the workspace's preview character and capture it. " +
        "Optionally opens a workspace (.aw, needs allowForeground), previews one animation row alone (its cell in the " +
        "Animation Sets tree), pauses and sets the exact frame (read back), switches the View preset, zooms (toward " +
        "the view centre), clicks the navigation cube, and writes a PNG of the viewport or the whole editor (returned as an " +
        "image). Windows only. Everything after opening runs without focus: UI Automation plus posted messages and " +
        "PrintWindow, in one hidden, time-limited PowerShell process. Posted drags cannot orbit this camera; use views, the " +
        "cube and zoom; hide the Graph/Channel Curves/Log Console docks (Window menu) for a bigger preview. Never saves the workspace or a graph (saving an AGF from the editor wipes its nodes).",
      inputSchema: {
        workspace: z.string().optional().describe("Project-relative .aw to open first, e.g. 'anims/workspaces/my.aw'."),
        clip: z.string().optional().describe("Animation row name in the Animation Sets tree to preview alone (exact)."),
        column: z.string().optional().describe("Column header for that row; default the first column."),
        frame: z.number().int().min(0).optional().describe("Frame to show; pauses playback and verifies the readback."),
        playback: z.enum(["play", "pause"]).optional(),
        view: z.enum(VIEWS).optional().describe("Preview View menu preset."),
        zoom: z.number().int().min(-30).max(30).optional().describe("Wheel ticks, + = closer."),
        cube: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional().describe("Viewport pixel [x,y] on the navigation cube to click."),
        out: z.string().optional().describe("PNG path to write. Default: a timestamped file in the OS temp folder."),
        capture: z.boolean().default(true).describe("Write and return a PNG."),
        target: z.enum(["viewport", "editor"]).default("viewport"),
        returnImage: z.boolean().default(true).describe("Return the PNG as image content as well as its path."),
        timeoutSec: z.number().int().min(5).max(120).default(45),
        allowForeground: z.boolean().default(false).describe("Required with workspace: opening the editor can activate Workbench."),
      },
    },
    async (input) => {
      try {
        if (process.platform !== "win32") {
          return { content: [{ type: "text" as const, text: "**Unsupported** — wb_anim_preview drives the Windows Workbench UI." }], isError: true };
        }
        const steps: string[] = [];
        if (!(await client.ping())) {
          return { content: [{ type: "text" as const, text: `**Workbench not reachable** on port ${config.workbenchPort}. Start it (wb_launch) or check ENFUSION_WORKBENCH_PORT.${formatConnectionStatus(client)}` }], isError: true };
        }
        if (input.workspace) {
          if (!input.allowForeground && !foregroundAuthorized()) {
            return { content: [{ type: "text" as const, text: "Error: opening a workspace can activate Workbench. Pass `allowForeground: true` only when the user permits foreground window activity." }], isError: true };
          }
          await client.call("EMCP_WB_EditorModule", { module: "animationEditor", action: "openResource", resourcePath: input.workspace, keepFocus: false });
          steps.push(`opened ${input.workspace}`);
          await sleep(1500);
        }
        const script = resolve(config.dataDir, "windows", "wb-anim-preview.ps1");
        if (!existsSync(script)) throw new Error(`preview script missing: ${script}`);
        let out: string | undefined;
        if (input.capture) {
          out = input.out ?? join(tmpdir(), "enfusion-mcp", `anim-preview-${Date.now()}.png`);
          mkdirSync(resolve(out, ".."), { recursive: true });
        }
        const args = previewScriptArgs(script, config.workbenchPort, { ...input, out });
        let stdout = "";
        let code = 0;
        try {
          ({ stdout } = await promisify(execFile)(powershellPath(), args, { windowsHide: true, timeout: input.timeoutSec * 1000, maxBuffer: 1 << 20 }));
        } catch (e) {
          const err = e as { stdout?: string; code?: number; killed?: boolean; message?: string };
          if (err.killed) throw new Error(`preview script timed out after ${input.timeoutSec}s`);
          stdout = err.stdout ?? "";
          code = typeof err.code === "number" ? err.code : 1;
          if (!stdout.trim()) throw new Error(err.message ?? "preview script failed");
        }
        const line = stdout.trim().split(/\r?\n/).filter((l) => l.startsWith("{")).pop() ?? "{}";
        const report = JSON.parse(line) as Record<string, unknown>;
        report.steps = [...steps, ...((report.steps as string[]) ?? [])];
        const ok = report.ok === true && code === 0;
        const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
          { type: "text", text: `**${ok ? "Preview ready" : "Preview failed"}**\n\`\`\`json\n${JSON.stringify(report, null, 1)}\n\`\`\`${formatConnectionStatus(client)}` },
        ];
        if (ok && out && input.returnImage && existsSync(out)) {
          content.push({ type: "image", data: readFileSync(out).toString("base64"), mimeType: "image/png" });
        }
        return { content, isError: !ok };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `**Preview failed**\n\n${renderError(e)}${formatConnectionStatus(client)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "wb_txa_compile",
    {
      description:
        "Build a .txa animation into its binary .anm with Workbench and wait for the result. The .txa must sit inside a " +
        "loaded addon. First time: registers it (RegisterResource), which builds the .anm and writes name.anm.meta. Later: " +
        "touches the .txa so Workbench's file watcher rebuilds it. Waits until the .anm is newer than the call and its size " +
        "has settled; builds one clip at a time (two builds of the same .anm in flight have crashed Workbench). Clips built " +
        "from TXA carry no animation events.",
      inputSchema: {
        path: z.string().describe("Absolute path of the .txa file inside a loaded addon."),
        timeoutSec: z.number().int().min(5).max(600).default(90),
      },
    },
    async ({ path, timeoutSec }) => {
      try {
        const txa = resolve(path);
        if (!txa.toLowerCase().endsWith(".txa") || !existsSync(txa)) throw new Error(`not an existing .txa: ${txa}`);
        const anm = txa.slice(0, -4) + ".anm";
        const header = readTxaHeader(readFileSync(txa, "utf8").slice(0, 400));
        const started = Date.now();
        const before = existsSync(anm) ? statSync(anm).mtimeMs : 0;
        let how: string;
        // Workbench writes the meta beside the built .anm (name.anm.meta), not beside the .txa
        const registered = existsSync(anm + ".meta") || existsSync(txa + ".meta");
        if (!registered) {
          await client.call("RegisterResource", { path: [txa] }, { tolerateErrorStatus: true });
          how = "registered";
        } else {
          const now = new Date();
          utimesSync(txa, now, now);
          how = "touched (file watcher rebuild)";
        }
        let size = -1;
        let stableSince = 0;
        while (Date.now() - started < timeoutSec * 1000) {
          await sleep(500);
          if (!existsSync(anm)) continue;
          const st = statSync(anm);
          if (st.mtimeMs <= before || st.mtimeMs < started - 2000) continue;
          if (st.size !== size) { size = st.size; stableSince = Date.now(); continue; }
          if (Date.now() - stableSince >= 1500) {
            const text = [
              `**ANM built** — ${how}, ${((Date.now() - started) / 1000).toFixed(1)} s`,
              `- anm: \`${anm}\` (${size} bytes)`,
              `- frames: ${header.numFrames ?? "?"} at ${header.fps ?? "?"} fps`,
              `- meta: ${existsSync(anm + ".meta") || existsSync(txa + ".meta") ? "present" : "missing"}`,
            ].join("\n");
            return { content: [{ type: "text" as const, text: text + formatConnectionStatus(client) }] };
          }
        }
        return { content: [{ type: "text" as const, text: `**ANM not built** — ${how}; no new \`${anm}\` within ${timeoutSec}s. Check the Workbench log for TXA import errors (bones missing from the skeleton, malformed keys) and that the file is inside a loaded addon.${formatConnectionStatus(client)}` }], isError: true };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `**TXA build failed**\n\n${renderError(e)}${formatConnectionStatus(client)}` }], isError: true };
      }
    }
  );
}
