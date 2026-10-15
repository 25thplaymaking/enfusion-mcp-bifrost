#!/usr/bin/env tsx
/**
 * Check every base-game resource reference in the KB, playbooks and tool
 * templates against the installed game data.
 *
 * WHY THIS EXISTS
 * ---------------
 * A 2026-10-11 sweep found the docs and generators pointing at prefabs that do
 * not ship with the game: the Scenario Framework KB told agents to place a
 * TaskManager prefab removed from the game, listed component IDs as prefab
 * GUIDs and wrong folders, and scenario_create_conflict emitted a workshop
 * mod's GameMode_Seize.et and an SCR_Iron_* class, so its output only loaded
 * with that mod present. Game updates move and delete prefabs; this makes the
 * drift visible.
 *
 * Reports, per reference:
 *   MISSING    the path does not exist in the game data (and is not a known
 *              placeholder or documented mod-only resource)
 *   GUID≠PATH  the game uses that GUID for a different path
 *
 * Needs ENFUSION_GAME_PATH (or the default Steam location). Reads every text
 * resource in the paks once, so it takes a little while.
 *
 * USAGE   npx tsx scripts/check-game-refs.ts     (exit 1 when problems are found)
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PakVirtualFS } from "../src/pak/vfs.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GAME = process.env.ENFUSION_GAME_PATH ?? "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Arma Reforger";

/** Example names in docs, and resources the docs explicitly label as mod-only. */
const ALLOWED = /\b(My[A-Z]\w*|Your\w*|MpTest)\b|\/path\/|X\.et|\.\.\.|Missions\/MissionHeader\.conf|_Seize\.et|IRON_|SCR_BattlePrepZone|RadioBroadcastManager|CampaignTaskManager|E_SeedingRestrictionZoneBase|GameMode_Escalation/;
const VANILLA_ROOT = /^(Prefabs|PrefabsEditable|Configs|UI|Assets|Sounds|Language|worlds|Missions|Terrains|Common|Particles|anims)\//i;
const REF = /(?:\{([0-9A-F]{16})\})?((?:Prefabs|PrefabsEditable|Configs|UI|Assets|Sounds|Language|worlds|Missions|Terrains|Common|Particles|anims)\/[\w ./-]+?\.(?:et|conf|layout|xob|emat|edds|ent|acp|ptc|agr|ast|asi|aw|imageset|st))\b/g;

function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) files(f, ext, out);
    else if (ext.test(n)) out.push(f);
  }
  return out;
}

function main(): void {
  const vfs = PakVirtualFS.get(GAME);
  if (!vfs || !existsSync(GAME)) {
    console.error(`Game data not found at ${GAME}. Set ENFUSION_GAME_PATH.`);
    process.exit(2);
  }
  const all = vfs.allFilePaths();
  const exists = new Set(all.map((p) => p.toLowerCase()));

  const sources = [
    ...files(join(REPO, "data", "kb"), /\.md$/),
    ...files(join(REPO, "src"), /\.ts$/),
    ...files(join(REPO, "data", "patterns"), /\.json$/),
    ...files(join(REPO, "data", "recipes"), /\.json$/),
  ];
  const refs: Array<{ where: string; guid?: string; path: string }> = [];
  for (const f of sources) {
    readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(REF)) refs.push({ where: `${f.slice(REPO.length + 1)}:${i + 1}`, guid: m[1], path: m[2] });
    });
  }

  const guids = new Set(refs.flatMap((r) => (r.guid ? [r.guid] : [])));
  const used = new Map<string, Set<string>>();
  for (const p of all) {
    if (!/\.(et|conf|ent|layer|layout|emat|st)$/i.test(p)) continue;
    let text = "";
    try { text = vfs.readTextFile(p); } catch { continue; }
    for (const m of text.matchAll(/\{([0-9A-F]{16})\}([^"\s]+)/g)) {
      if (guids.has(m[1])) (used.get(m[1]) ?? used.set(m[1], new Set()).get(m[1])!).add(m[2].toLowerCase());
    }
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    const key = `${r.guid ?? ""}|${r.path}|${r.where.split(":")[0]}`;
    if (seen.has(key) || ALLOWED.test(r.path) || !VANILLA_ROOT.test(r.path)) continue;
    seen.add(key);
    const present = exists.has(r.path.toLowerCase());
    if (!present) {
      problems.push(`MISSING    ${r.where}  ${r.guid ? `{${r.guid}}` : ""}${r.path}`);
      continue;
    }
    const paths = r.guid ? used.get(r.guid) : undefined;
    if (paths && !paths.has(r.path.toLowerCase())) {
      problems.push(`GUID≠PATH  ${r.where}  {${r.guid}}${r.path}  (game uses it for ${[...paths].join(", ")})`);
    }
  }
  for (const p of problems) console.log(p);
  console.log(`${seen.size} reference(s) checked against ${all.length} game files; ${problems.length} problem(s).`);
  if (problems.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
