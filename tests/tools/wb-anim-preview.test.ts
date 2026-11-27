import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { previewScriptArgs, readTxaHeader } from "../../src/tools/wb-anim-preview.js";

const REPO = join(__dirname, "..", "..");

describe("wb_anim_preview", () => {
  it("passes only the steps that were asked for, in the script's parameter names", () => {
    const args = previewScriptArgs("s.ps1", 5775, { clip: "P1_Hold", frame: 12, view: "Right", zoom: -2, zoomAt: [10, 20], out: "x.png", target: "editor" });
    expect(args.slice(0, 9)).toEqual(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "s.ps1", "-Port", "5775"]);
    const rest = args.slice(9).join(" ");
    expect(rest).toBe("-Clip P1_Hold -Frame 12 -View Right -Zoom -2 -ZoomAtX 10 -ZoomAtY 20 -Out x.png -Target editor");
  });

  it("keeps frame 0 and omits a zero zoom", () => {
    const rest = previewScriptArgs("s.ps1", 5777, { frame: 0, zoom: 0 }).slice(9).join(" ");
    expect(rest).toBe("-Frame 0");
  });

  it("ships the preview script and never makes it save anything", () => {
    const script = join(REPO, "data", "windows", "wb-anim-preview.ps1");
    expect(existsSync(script)).toBe(true);
    const text = readFileSync(script, "utf-8");
    expect(text).not.toMatch(/SetForegroundWindow|SendInput|mouse_event|keybd_event/);
    expect(text).not.toMatch(/\bSave\(\)/);
  });
});

describe("wb_txa_compile", () => {
  it("reads fps and frame count from a TXA header", () => {
    expect(readTxaHeader('$animation "" {\n #version 2\n #fps 30\n #numFrames 17\n')).toEqual({ fps: 30, numFrames: 17 });
    expect(readTxaHeader("garbage")).toEqual({ fps: undefined, numFrames: undefined });
  });
});
