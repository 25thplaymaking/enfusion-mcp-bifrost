#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
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
  for (const required of ["wiki_search", "menu_create", "wb_compile_status", "wb_validate_scripts", "wb_diagnose", "wb_editor_module", "editor_asset", "wb_capabilities", "wb_batch", "wb_bridge", "wb_docs", "wb_debug"]) {
    if (!names.includes(required)) throw new Error(`Required tool missing: ${required}`);
  }

  if (!client.getInstructions()?.includes("wb_capabilities")) throw new Error("Codex server instructions missing");
  const docs = await client.listResources();
  for (const document of ["CODEX_WORKBENCH.md", "WORKBENCH_EDITOR_OPERATIONS.md", "NATIVE_AGENT_WORKFLOW.md"]) {
    const uri = `enfusion://workbench/docs/${document}`;
    if (!docs.resources.some(resource => resource.uri === uri)) throw new Error(`Documentation resource missing: ${document}`);
    const resource = await client.readResource({ uri });
    if (!resource.contents.some(content => typeof content.text === "string" && content.text.length > 100)) throw new Error(`Documentation resource is empty: ${document}`);
  }
  const capabilities = await client.callTool({ name: "wb_capabilities", arguments: { live: process.argv.includes("--live") } });
  if (capabilities.isError || capabilities.structuredContent?.editors?.length !== 10) throw new Error("Editor capability map failed");
  let liveEvidence = null;
  if (process.argv.includes("--live")) {
    const live = capabilities.structuredContent?.live;
    if (live?.state?.outcome !== "completed" || live?.projects?.outcome !== "completed") throw new Error("Live state/project probe failed");
    if (Object.values(live.modules ?? {}).length !== 10 || Object.values(live.modules).some(result => result.outcome !== "completed")) throw new Error("Live editor module probe failed");
    const batch = await client.callTool({ name: "wb_batch", arguments: { steps: [
      { tool: "wb_projects", arguments: { action: "list" } },
      { tool: "wb_editor_module", arguments: { action: "state", module: "resourceManager" } },
    ] } });
    if (batch.isError || batch.structuredContent?.executed !== 2) throw new Error("Live ordered batch failed");
    liveEvidence = { modules: Object.keys(live.modules), projects: live.projects.data, batchExecuted: batch.structuredContent.executed };
    const projectFlag = process.argv.indexOf("--project-path");
    if (projectFlag >= 0) {
      const projectPath = process.argv[projectFlag + 1];
      if (!projectPath) throw new Error("--project-path requires an absolute loaded project path");
      const located = await client.callTool({ name: "wb_projects", arguments: { action: "locate", path: projectPath } });
      if (located.isError || !located.structuredContent?.data?.projectName) throw new Error(`Native project locate failed: ${JSON.stringify(located.content)}`);
      const prefabs = await client.callTool({ name: "wb_prefabs", arguments: { action: "locate", searchPath: projectPath } });
      const paths = prefabs.structuredContent?.data?.prefabsPaths;
      if (prefabs.isError || !paths?.length) throw new Error(`Native prefab locate failed: ${JSON.stringify(prefabs.content)}`);
      const guid = await client.callTool({ name: "wb_prefabs", arguments: { action: "getGuid", templatePath: paths[0] } });
      if (guid.isError || !guid.structuredContent?.data?.guid) throw new Error(`Native prefab GUID lookup failed: ${JSON.stringify(guid.content)}`);
      liveEvidence.nativeAdapters = { project: located.structuredContent.data.projectName, prefabCount: paths.length, guid: guid.structuredContent.data.guid };
    }
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
    const read = await client.callTool({ name: "project", arguments: { action: "read", path: arguments_.outputPath, projectPath: outputRoot, startLine: 1, maxLines: 2 } });
    if (read.isError || !read.structuredContent?.sha256) throw new Error("Paged editor-source read failed");
  }

  const source = "Scripts/Smoke.c";
  const written = await client.callTool({ name: "project", arguments: { action: "write", path: source, content: "class Smoke { int value = 1; }", projectPath: outputRoot } });
  if (written.isError) throw new Error("Source write failed");
  const edited = await client.callTool({ name: "project", arguments: { action: "edit", path: source, oldText: "value = 1", newText: "value = 2", expectedSha256: written.structuredContent.sha256, projectPath: outputRoot } });
  if (edited.isError || !edited.structuredContent?.written) throw new Error("Hash-checked source edit failed");
  const search = await client.callTool({ name: "project", arguments: { action: "search", query: "value = 2", pattern: "*.c", projectPath: outputRoot } });
  if (search.isError || search.structuredContent?.matches?.length !== 1 || search.structuredContent.partial) throw new Error("Source search failed");

  process.stdout.write(JSON.stringify({
    protocol: "ok",
    toolCount: names.length,
    liveEvidence,
    generatedEditorAssets: assets.map((asset) => asset.outputPath),
    sourceEditAndSearch: "passed",
    temporaryFiles: "removed on exit",
  }));
} finally {
  await client.close();
  const resolvedOutput = resolve(outputRoot);
  if (dirname(resolvedOutput) !== resolve(tmpdir()) || !basename(resolvedOutput).startsWith("bifrost-mcp-smoke-")) throw new Error("Unexpected smoke fixture directory");
  rmSync(resolvedOutput, { recursive: true, force: true });
}
