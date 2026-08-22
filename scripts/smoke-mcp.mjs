#!/usr/bin/env node

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = resolve(import.meta.dirname, "..");
const outputRoot = mkdtempSync(join(tmpdir(), "bifrost-mcp-smoke-"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(packageRoot, "dist", "index.js")],
  env: {
    ...process.env,
    ENFUSION_PROJECT_PATH: outputRoot,
    ENFUSION_WORKBENCH_PROFILE:
      process.env.ENFUSION_WORKBENCH_PROFILE ??
      "C:\\Users\\Bryce\\Documents\\My Games\\ArmaReforgerWorkbench",
  },
  stderr: "pipe",
});
const client = new Client({ name: "bifrost-mcp-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  for (const required of ["wiki_search", "menu_create", "wb_compile_status", "wb_validate_scripts", "wb_diagnose", "wb_editor_module", "editor_asset"]) {
    if (!names.includes(required)) throw new Error(`Required tool missing: ${required}`);
  }

  const wiki = await client.callTool({
    name: "wiki_search",
    arguments: { query: "Workbench NET API", limit: 2 },
  });
  if (wiki.isError) throw new Error("wiki_search smoke call failed");

  const menu = await client.callTool({
    name: "menu_create",
    arguments: {
      action: "create",
      className: "BIF_SmokeMenu",
      title: "Bifrost Smoke Menu",
      projectPath: outputRoot,
    },
  });
  if (menu.isError) throw new Error("menu_create smoke call failed");

  const compile = await client.callTool({
    name: "wb_compile_status",
    arguments: { includeWarnings: false, maxDiagnostics: 5 },
  });
  if (compile.isError) throw new Error("wb_compile_status smoke call failed");

  const editorCapabilities = await client.callTool({
    name: "editor_asset",
    arguments: { action: "capabilities" },
  });
  if (editorCapabilities.isError) throw new Error("editor_asset capabilities smoke call failed");

  const assets = [
    {
      action: "createAudio",
      outputPath: "Sounds/BIF_Smoke.acp",
      name: "BIF_SMOKE_SOUND",
      sampleResource: "{0123456789ABCDEF}Sounds/Samples/BIF_Smoke.wav",
    },
    {
      action: "createParticle",
      outputPath: "Particles/BIF_Smoke.ptc",
      name: "BIF_SmokeEmitter",
      materialResource: "{0123456789ABCDEF}Particles/Materials/BIF_Smoke.emat",
    },
    {
      action: "createProcSignal",
      outputPath: "Animations/BIF_Smoke.siga",
      inputName: "Input",
      outputName: "Rotation",
    },
    {
      action: "createProcRotation",
      outputPath: "Animations/BIF_Smoke.pap",
      signalResource: "{0123456789ABCDEF}Animations/BIF_Smoke.siga",
      modelResource: "{FEDCBA9876543210}Assets/BIF_Smoke.xob",
      boneName: "smoke_bone",
    },
  ];
  for (const arguments_ of assets) {
    const result = await client.callTool({ name: "editor_asset", arguments: arguments_ });
    if (result.isError) throw new Error(`editor_asset ${arguments_.action} smoke call failed: ${JSON.stringify(result.content)}`);
    const inspected = await client.callTool({
      name: "editor_asset",
      arguments: { action: "inspect", path: arguments_.outputPath, projectPath: outputRoot },
    });
    if (inspected.isError) throw new Error(`editor_asset inspect failed for ${arguments_.outputPath}`);
  }

  process.stdout.write(JSON.stringify({
    protocol: "ok",
    toolCount: names.length,
    outputRoot,
    generatedLayout: join(outputRoot, "UI", "layouts", "Menus", "BIF_SmokeMenu.layout"),
    generatedEditorAssets: assets.map((asset) => join(outputRoot, asset.outputPath)),
  }));
} finally {
  await client.close();
}
