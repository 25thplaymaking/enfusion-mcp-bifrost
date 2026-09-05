import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_LOG_READ_BYTES = 2 * 1024 * 1024;

export interface CompileLogCursor {
  path: string | null;
  offset: number;
}

export interface CompileDiagnostic {
  severity: "error" | "warning";
  file?: string;
  line?: number;
  message: string;
}

export interface CompileLogReport {
  logPath: string | null;
  sawCompile: boolean;
  sawWorkbenchGameModule: boolean;
  failed: boolean;
  diagnostics: CompileDiagnostic[];
  truncated: boolean;
}

function latestScriptLog(profilePath: string): string | null {
  const logsRoot = join(profilePath, "logs");
  if (!existsSync(logsRoot)) return null;

  let latest: { path: string; mtimeMs: number } | null = null;
  for (const entry of readdirSync(logsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("logs_")) continue;
    const candidate = join(logsRoot, entry.name, "script.log");
    if (!existsSync(candidate)) continue;
    const mtimeMs = statSync(candidate).mtimeMs;
    if (!latest || mtimeMs > latest.mtimeMs) latest = { path: candidate, mtimeMs };
  }
  return latest?.path ?? null;
}

export function captureCompileLogCursor(profilePath: string): CompileLogCursor {
  const path = latestScriptLog(profilePath);
  return { path, offset: path ? statSync(path).size : 0 };
}

function readTail(path: string, requestedOffset: number): { text: string; truncated: boolean } {
  const size = statSync(path).size;
  let offset = Math.min(Math.max(0, requestedOffset), size);
  let truncated = false;
  if (size - offset > MAX_LOG_READ_BYTES) {
    offset = size - MAX_LOG_READ_BYTES;
    truncated = true;
  }

  const length = size - offset;
  if (length <= 0) return { text: "", truncated };
  const buffer = Buffer.allocUnsafe(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, length, offset);
  } finally {
    closeSync(fd);
  }
  return { text: buffer.toString("utf8"), truncated };
}

/** Parse the structured diagnostics Workbench writes to script.log. */
export function parseCompileLog(text: string, logPath: string | null = null, truncated = false): CompileLogReport {
  const diagnostics: CompileDiagnostic[] = [];
  const seen = new Set<string>();
  let failed = false;
  let sawCompile = false;
  let sawWorkbenchGameModule = false;

  for (const lineText of text.split(/\r?\n/)) {
    if (/\b(?:Compiling|Reloading)\s+(?:GameLib|Game|Workbench)\s+scripts\b/i.test(lineText)) {
      sawCompile = true;
    }
    if (/\bModule:\s+WorkbenchGame;\s+loaded\b/i.test(lineText)) {
      sawWorkbenchGameModule = true;
    }
    if (/Can't compile\s+"[^"]+"\s+script module|script compilation failed/i.test(lineText)) {
      failed = true;
    }

    const structured = lineText.match(
      /SCRIPT\s+\(([EW])\):\s+@"([^"]+\.c),(\d+)":\s*(.+)$/i
    );
    const compact = lineText.match(/^\s*([^\r\n]+\.c)\((\d+)\):\s*(.+)$/i);
    let diagnostic: CompileDiagnostic | null = null;
    if (structured) {
      diagnostic = {
        severity: structured[1].toUpperCase() === "E" ? "error" : "warning",
        file: structured[2],
        line: Number(structured[3]),
        message: structured[4].trim(),
      };
    } else if (compact) {
      diagnostic = {
        severity: "error",
        file: compact[1],
        line: Number(compact[2]),
        message: compact[3].trim(),
      };
    }

    if (!diagnostic) continue;
    if (diagnostic.severity === "error") failed = true;
    const key = `${diagnostic.severity}|${diagnostic.file}|${diagnostic.line}|${diagnostic.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  }

  return { logPath, sawCompile, sawWorkbenchGameModule, failed, diagnostics, truncated };
}

/** Read only the log bytes written since a cursor, following Workbench log rotation. */
export function readCompileLogSince(profilePath: string, cursor: CompileLogCursor): CompileLogReport {
  const path = latestScriptLog(profilePath);
  if (!path) return parseCompileLog("", null);
  const offset = path === cursor.path ? cursor.offset : 0;
  const { text, truncated } = readTail(path, offset);
  return parseCompileLog(text, path, truncated);
}

/** Read the latest bounded log tail for a read-only status check. */
export function readLatestCompileLog(profilePath: string): CompileLogReport {
  const path = latestScriptLog(profilePath);
  if (!path) return parseCompileLog("", null);
  const size = statSync(path).size;
  const { text, truncated } = readTail(path, Math.max(0, size - MAX_LOG_READ_BYTES));
  const markers = [...text.matchAll(/^(?=.*\b(?:Compiling|Reloading)\s+(?:GameLib|Game|Workbench)\s+scripts\b).*$/gim)];
  const latestMarker = markers.at(-1);
  const relevant = latestMarker?.index === undefined ? text : text.slice(latestMarker.index);
  return parseCompileLog(relevant, path, truncated);
}
