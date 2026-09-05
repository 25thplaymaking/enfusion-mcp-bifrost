import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WorkbenchError } from "../../src/workbench/client.js";
import {
  isExpectedNativeReloadDisconnect,
  isReloadConfirmed,
  shouldProbeReloadHandler,
} from "../../src/tools/wb-reload.js";

describe("wb_reload confirmation", () => {
  it("requires both a new script compile marker and handlers back", () => {
    expect(isReloadConfirmed("scripts", true, { sawWorkbenchGameModule: false })).toBe(false);
    expect(isReloadConfirmed("scripts", false, { sawWorkbenchGameModule: true })).toBe(false);
    expect(isReloadConfirmed("scripts", true, { sawWorkbenchGameModule: true })).toBe(true);
    expect(isReloadConfirmed("both", true, { sawWorkbenchGameModule: true })).toBe(true);
  });

  it("allows plugin-only reload confirmation without a script marker", () => {
    expect(isReloadConfirmed("plugins", true, { sawWorkbenchGameModule: false })).toBe(true);
  });

  it("does not emit health probes while WorkbenchGame is absent or failed", () => {
    expect(shouldProbeReloadHandler("scripts", {
      sawWorkbenchGameModule: false,
      failed: false,
    })).toBe(false);
    expect(shouldProbeReloadHandler("scripts", {
      sawWorkbenchGameModule: true,
      failed: true,
    })).toBe(false);
    expect(shouldProbeReloadHandler("scripts", {
      sawWorkbenchGameModule: true,
      failed: false,
    })).toBe(true);
    expect(shouldProbeReloadHandler("plugins", {
      sawWorkbenchGameModule: false,
      failed: false,
    })).toBe(true);
  });
});

describe("EMCP_WB_Reload reply lifetime", () => {
  it("keeps script reload out of GetResponse", () => {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const source = readFileSync(
      `${repoRoot}mod/Scripts/WorkbenchGame/EnfusionMCP/EMCP_WB_Reload.c`,
      "utf8"
    );
    const handler = source.slice(source.indexOf("class EMCP_WB_Reload : NetApiHandler"));

    expect(handler).toContain("this handler supports plugins only");
    expect(handler).not.toContain("ScriptEditor");
    expect(handler).not.toContain("CallLater");
  });

  it("accepts the native reload endpoint's teardown disconnect or timeout", () => {
    expect(
      isExpectedNativeReloadDisconnect(new WorkbenchError("connection closed", "PROTOCOL_ERROR"))
    ).toBe(true);
    expect(
      isExpectedNativeReloadDisconnect(new WorkbenchError("timed out", "TIMEOUT"))
    ).toBe(true);
    expect(
      isExpectedNativeReloadDisconnect(new WorkbenchError("refused", "CONNECTION_REFUSED"))
    ).toBe(false);
    expect(isExpectedNativeReloadDisconnect(new Error("connection closed"))).toBe(false);
  });

  it("keeps the TypeScript reload path native and free of window activation APIs", () => {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const source = readFileSync(`${repoRoot}src/tools/wb-reload.ts`, "utf8");

    expect(source).toContain('client.call<Record<string, unknown>>("ReloadScripts")');
    expect(source).not.toMatch(/OpenModule|SetOpenedResource|SetForegroundWindow|ShowWindow|UIAutomation/);
  });
});
