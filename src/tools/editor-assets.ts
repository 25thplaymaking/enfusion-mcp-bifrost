import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dirname, extname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Config } from "../config.js";
import { parse, type EnfusionNode } from "../formats/enfusion-text.js";
import { PakVirtualFS } from "../pak/vfs.js";
import { validateEnforceIdentifier, validateProjectPath } from "../utils/safe-path.js";

const EDITOR_CAPABILITIES = `# Workbench editor capability map

| Editor | Live public API | Structured MCP support |
|---|---|---|
| Resource Manager | register, rebuild, open, save, actions | wb_resources + wb_editor_module |
| Script Editor | file/line read and edit, open, save, actions | wb_script_editor + compile-aware wb_reload |
| World Editor | rich world/entity/terrain/layer APIs | wb_entity_*, wb_terrain, wb_layers, scenarios |
| Localization Editor | tables, translations, save, actions | wb_localization + wb_editor_module |
| Animation Editor | shared WBModuleDef only | animation_graph authors/inspects AGR/AST/AGF/ASI/AW, including vehicle IK guidance |
| Audio Editor | shared WBModuleDef only | editor_asset creates/inspects ACP; wb_editor_module opens/saves/executes verified actions |
| Particle Editor | shared WBModuleDef only | editor_asset creates/inspects PTC; wb_editor_module controls the editor |
| Procedural Animation Editor | shared WBModuleDef only | editor_asset creates/inspects SIGA/PAP; wb_editor_module controls the editor |
| Behavior Editor | shared WBModuleDef only; no packed behavior graph format was found | wb_editor_module only—no fabricated graph writer |

The module tool defaults keepFocus=false. Menu actions report false as errors instead of claiming success.`;

const SUPPORTED_EXTENSIONS = new Set([".acp", ".ptc", ".pap", ".siga"]);
const RESOURCE_REF = /^\{[0-9A-Fa-f]{16}\}.+/;

function assertResourceRef(value: string, field: string): void {
  if (!RESOURCE_REF.test(value)) {
    throw new Error(`${field} must be a Workbench resource reference such as {0123456789ABCDEF}Path/File.ext`);
  }
}

function assertOutput(path: string, extension: string): void {
  if (extname(path).toLowerCase() !== extension) {
    throw new Error(`outputPath must end in ${extension}`);
  }
}

function writeNewProjectFile(basePath: string, outputPath: string, content: string, overwrite: boolean): string {
  const fullPath = validateProjectPath(basePath, outputPath);
  if (existsSync(fullPath) && !overwrite) {
    throw new Error(`File already exists: ${outputPath}. Set overwrite=true to replace it.`);
  }
  parse(content);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

function readAsset(path: string, source: "mod" | "game", projectPath: string, config: Config): string {
  if (!SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new Error(`Unsupported editor resource type: ${extname(path)}. Supported: ${[...SUPPORTED_EXTENSIONS].join(", ")}`);
  }
  if (source === "mod") {
    const fullPath = validateProjectPath(projectPath, path);
    if (!existsSync(fullPath)) throw new Error(`File not found: ${path}`);
    const content = readFileSync(fullPath, "utf-8");
    if (content.length > 2_000_000) throw new Error("Editor resource exceeds the 2 MB inspection limit");
    return content;
  }
  const vfs = PakVirtualFS.get(config.gamePath);
  if (!vfs || !vfs.exists(path)) throw new Error(`Base-game resource not found: ${path}`);
  if (vfs.fileSize(path) > 2_000_000) throw new Error("Editor resource exceeds the 2 MB inspection limit");
  return vfs.readTextFile(path);
}

function summarize(root: EnfusionNode): string {
  const counts = new Map<string, number>();
  let nodes = 0;
  let properties = 0;
  const visit = (node: EnfusionNode): void => {
    nodes++;
    properties += node.properties.length;
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    for (const prop of node.properties) if (typeof prop.value !== "string") visit(prop.value);
    for (const child of node.children) visit(child);
  };
  visit(root);
  const types = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  return [
    `Root: ${root.type}`,
    `Nodes: ${nodes}`,
    `Properties: ${properties}`,
    "Node types:",
    ...types.map(([type, count]) => `- ${type}: ${count}`),
  ].join("\n");
}

function audioProject(eventName: string, sampleResource: string, volumeDb: number, loop: boolean): string {
  const sampleName = sampleResource.slice(sampleResource.lastIndexOf("/") + 1).replace(/"/g, "");
  return `AudioClass {
 sounds {
  SoundClass "2057" {
   id 2057
   name "${eventName}"
   version 5
   ins {
    ConnectionsClass "con:0" { id 0 links { ConnectionClass "33804:1" { id 33804 port 1 } } }
    ConnectionsClass "con:64" { id 64 links { ConnectionClass "1042:65" { id 1042 port 65 } } }
   }
   pi { 1 0 }
   outState 28683
   outStatePort 79879
  }
 }
 mixers {
  MixerClass "28683" {
   id 28683
   name "OutputState"
   version 4
   res "{B764D803219C775E}Sounds/FinalMix.afm"
   ins { ConnectionsClass "con:79879" { id 79879 links { ConnectionClass "2057:65" { id 2057 port 65 } } } }
   path "{B764D803219C775E}Sounds/FinalMix.afm"
  }
 }
 constants { ConstantClass "33804" { id 33804 name "Trigger" version 5 "Constant values" { IOPConstantsValueClass Trigger { Key "Trigger" Value 1 Port 1 } } } }
 shaders {
  ShaderClass "1042" {
   id 1042
   name "Shader"
   version 5
   ins {
    ConnectionsClass "con:0" { id 0 links { ConnectionClass "4124:65" { id 4124 port 65 } } }
    ConnectionsClass "con:1" { id 1 links { ConnectionClass "34835:65" { id 34835 port 65 } } }
    ConnectionsClass "con:64" { id 64 links { ConnectionClass "14340:65" { id 14340 port 65 } } }
   }
  }
 }
 amplitudes { AmplitudeClass "34835" : "{D6921F7062BE7960}Sounds/_SharedData/Configs/Amplitude/_SharedData/Amplitude_-60LUFS_to_-55LUFS.conf" { id 34835 version 5 parent "{D6921F7062BE7960}Sounds/_SharedData/Configs/Amplitude/_SharedData/Amplitude_-60LUFS_to_-55LUFS.conf" } }
 banks_local {
  BankLocalClass "14340" {
   id 14340
   name "Sample"
   version 7
   Volume ${volumeDb}
   "Loop count" ${loop ? 255 : 1}
   "Infinite loop" ${loop ? 1 : 0}
   Samples { AudioBankSampleClass "${sampleName}" { Filename "${sampleResource}" Probability 100 Index 0 SampleMetadata "" } }
  }
 }
 spatialities { SpatialityClass "4124" { id 4124 name "Spatiality 3D" version 5 spatialFactor 1 } }
 version 1
}`;
}

function particleEffect(name: string, materialResource: string, birthRate: number, lifetime: number): string {
  return `EffectDef {
 Version 2
 Emitters {
  EmitterDef ${name} {
   ShapeType Box
   ShapeSize 1 1 1
   ConeAngle 360 90 180
   BirthRate ${birthRate}
   Material "${materialResource}"
   SizeMultiplier 1
   SizeRND 0.25
   Velocity 1
   VelocityRND 0.25
   AirResistance 0.1
   WindInfluence 0.25
   GravityMultiply 0
   AnimFPS 30
   Lifetime ${lifetime}
   LifetimeRND 0.1
   Color { 0 1 1 1 }
   Alpha { 0 0 0.1 1 0.8 1 1 0 }
   Size { 0 0.1 0.2 1 1 0 }
   EmittingTime 1
   Repeat 0
  }
 }
}`;
}

function procSignal(inputName: string, outputName: string, fadeIn: number, fadeOut: number): string {
  return `ProcAnimSignalResClass {
 Inputs { IOPItemInputClass { id 1 name "${inputName}" tl -300 0 children { 5 } } }
 Ops {
  IOPItemOpSmootherClass {
   id 5
   name "Smoother"
   tl 0 0
   children { 2 }
   inputs { ConnectionClass connection { id 1 port 0 } }
   "Fade In Time" ${fadeIn}
   "Fade Out Time" ${fadeOut}
  }
 }
 Outputs { IOPItemOutputClass { id 2 name "${outputName}" tl 300 0 input 5 } }
}`;
}

function procRotation(signalResource: string, modelResource: string, boneName: string): string {
  return `ProcAnimProjectClass {
 signals {
  SignalClass { id 24580 name "Signal" tl -600 0 res "${signalResource}" inputsport { 1 } outputsport { 2 } inputvalues { 0 } inputvaluesmin { 0 } inputvaluesmax { 1 } }
 }
 funcs {
  BoneClass { id 3078 name "Bone" version 0 tl -300 100 outs { 9222 } bone "${boneName}" }
  RotationMakeClass {
   id 10246 name "Rotation" tl -300 -100
   iops { IOPConnectionClass iopConnection { port 0 conn { ConnectionsClass connections { id 0 links { ConnectionClass connection { id 24580 port 2 } } } } } }
   outs { 9222 }
  }
  RotationSetClass {
   id 9222 name "Apply Rotation" tl 0 0
   funcs {
    IOPConnectionClass iopConnection { port 0 conn { ConnectionsClass connections { id 2 links { ConnectionClass connection { id 3078 port 0 } } } } }
    IOPConnectionClass iopConnection { port 1 conn { ConnectionsClass connections { id 2 links { ConnectionClass connection { id 10246 port 0 } } } } }
   }
  }
 }
 model "${modelResource}"
 version 1
}`;
}

export function registerEditorAssets(server: McpServer, config: Config): void {
  server.registerTool("editor_asset", {
    description:
      "Evidence-backed assets for the Workbench graph editors. Inspect ACP/PTC/PAP/SIGA files, create a minimal Audio Editor project, create a Particle Editor effect, or create Procedural Animation signal/rotation graphs. Generated text is parsed before writing and never overwrites by default.",
    inputSchema: {
      action: z.enum(["capabilities", "inspect", "createAudio", "createParticle", "createProcSignal", "createProcRotation"]),
      path: z.string().optional(),
      source: z.enum(["mod", "game"]).default("mod"),
      projectPath: z.string().optional(),
      outputPath: z.string().optional(),
      overwrite: z.boolean().default(false),
      name: z.string().optional(),
      sampleResource: z.string().optional(),
      materialResource: z.string().optional(),
      signalResource: z.string().optional(),
      modelResource: z.string().optional(),
      boneName: z.string().optional(),
      volumeDb: z.number().min(-96).max(12).default(-12),
      loop: z.boolean().default(false),
      birthRate: z.number().positive().max(100000).default(20),
      lifetime: z.number().positive().max(3600).default(1),
      inputName: z.string().default("Input"),
      outputName: z.string().default("Output"),
      fadeIn: z.number().min(0).max(3600).default(0.1),
      fadeOut: z.number().min(0).max(3600).default(0.1),
    },
  }, async (opts) => {
    try {
      if (opts.action === "capabilities") return { content: [{ type: "text", text: EDITOR_CAPABILITIES }] };
      const basePath = opts.projectPath || config.projectPath;
      if (opts.action === "inspect") {
        if (!opts.path) throw new Error("path is required for inspect");
        const content = readAsset(opts.path, opts.source, basePath, config);
        return { content: [{ type: "text", text: `# ${opts.path}\n\n${summarize(parse(content))}` }] };
      }
      if (!opts.outputPath) throw new Error("outputPath is required for create actions");
      let content: string;
      if (opts.action === "createAudio") {
        assertOutput(opts.outputPath, ".acp");
        if (!opts.name || !opts.sampleResource) throw new Error("name and sampleResource are required for createAudio");
        validateEnforceIdentifier(opts.name);
        assertResourceRef(opts.sampleResource, "sampleResource");
        content = audioProject(opts.name, opts.sampleResource, opts.volumeDb, opts.loop);
      } else if (opts.action === "createParticle") {
        assertOutput(opts.outputPath, ".ptc");
        if (!opts.name || !opts.materialResource) throw new Error("name and materialResource are required for createParticle");
        validateEnforceIdentifier(opts.name);
        assertResourceRef(opts.materialResource, "materialResource");
        content = particleEffect(opts.name, opts.materialResource, opts.birthRate, opts.lifetime);
      } else if (opts.action === "createProcSignal") {
        assertOutput(opts.outputPath, ".siga");
        validateEnforceIdentifier(opts.inputName);
        validateEnforceIdentifier(opts.outputName);
        content = procSignal(opts.inputName, opts.outputName, opts.fadeIn, opts.fadeOut);
      } else {
        assertOutput(opts.outputPath, ".pap");
        if (!opts.signalResource || !opts.modelResource || !opts.boneName) throw new Error("signalResource, modelResource, and boneName are required for createProcRotation");
        assertResourceRef(opts.signalResource, "signalResource");
        assertResourceRef(opts.modelResource, "modelResource");
        validateEnforceIdentifier(opts.boneName);
        content = procRotation(opts.signalResource, opts.modelResource, opts.boneName);
      }
      const fullPath = writeNewProjectFile(basePath, opts.outputPath, content, opts.overwrite);
      return { content: [{ type: "text", text: `Created and syntax-validated ${opts.outputPath}\n${fullPath}\n\nRegister/rebuild it with wb_resources, then open it with wb_editor_module.` }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Editor asset error: ${message}` }], isError: true };
    }
  });
}
