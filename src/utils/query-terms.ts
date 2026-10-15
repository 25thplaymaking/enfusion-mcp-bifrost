/**
 * Query-side vocabulary shared by the KB, playbook and wiki retrieval:
 * a crude stemmer plus agent-phrasing synonyms.
 */

/**
 * Reduce an English word to a crude stem so agent phrasing matches index
 * keywords. Deliberately tiny and dependency-free — a retrieval aid, not a
 * linguist. It exists because the failures were concrete and embarrassing:
 *
 *   "particles"                       → no match (index says "particle")
 *   "footsteps"                       → no match
 *   "how do I replicate to clients"   → no match (index says "replication")
 *
 * Each miss cost a full round trip AND dumped the entire index back, which is
 * how the KB looks empty at exactly the moment an agent needs it.
 *
 * Both sides are stemmed so agreement is symmetric.
 */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;

  // Plurals / third person. Order matters: -ies before the generic -s.
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses") || w.endsWith("shes") || w.endsWith("ches") || w.endsWith("xes"))
    w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);

  // Verb / adverb endings that never change which topic a word points at.
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("ly") && w.length > 4) w = w.slice(0, -2);

  // The -ing/-ed pass above can leave a dangling 'e' ("replicat" + "e").
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  // "replication"/"replications" → "replicat", so it agrees with "replicate".
  if (w.endsWith("ion") || w.endsWith("ions")) w = w.replace(/ions?$/, "t");
  if (w.endsWith("ment") && w.length > 5) w = w.slice(0, -4);

  // Collapse a doubled consonant left behind ("replac" → "replace").
  if (w.length > 3 && /([bdfglmnprt])\1$/.test(w) && !/(ss|ll|ff|oo)$/.test(w)) w = w.slice(0, -1);

  return w;
}

/**
 * Words an agent uses that name a KB topic by another name. Query-side only —
 * expanding the index too would blur distinct topics together. Each entry is
 * `agent phrasing -> vocabulary the index actually uses`.
 */
const SYNONYMS: Record<string, string[]> = {
  replicate: ["replication", "multiplayer", "network"],
  replicated: ["replication", "multiplayer"],
  netcode: ["replication", "multiplayer"],
  footsteps: ["audio", "sound"],
  footstep: ["audio", "sound"],
  hurt: ["damage"],
  health: ["damage"],
  shooting: ["weapon"],
  shoot: ["weapon"],
  gun: ["weapon"],
  guns: ["weapon"],
  rifle: ["weapon"],
  car: ["vehicle"],
  cars: ["vehicle"],
  truck: ["vehicle"],
  driving: ["vehicle", "physics"],
  drive: ["vehicle", "physics"],
  hud: ["ui", "layout"],
  gui: ["ui", "layout"],
  menu: ["ui", "layout"],
  dialog: ["ui", "dialog"],
  dialogue: ["ui", "dialog"],
  tooltip: ["ui", "tooltip"],
  widget: ["ui", "layout"],
  widgets: ["ui", "layout"],
  mesh: ["model", "asset"],
  meshes: ["model", "asset"],
  model: ["model", "asset", "blender"],
  models: ["model", "asset", "blender"],
  fbx: ["blender", "fbx"],
  importer: ["blender", "import"],
  importing: ["blender", "import"],
  tree: ["vegetation"],
  trees: ["vegetation"],
  grass: ["vegetation", "terrain"],
  foliage: ["vegetation"],
  npc: ["ai"],
  bots: ["ai"],
  ragdoll: ["physics"],
  landscape: ["terrain"],
  heightmap: ["terrain"],
  code: ["script", "scripting"],
  bug: ["pitfall"],
  error: ["pitfall"],
  broken: ["pitfall"],
  fails: ["pitfall"],
  failure: ["pitfall"],
  pitfall: ["pitfall"],
  gotcha: ["pitfall"],
  trick: ["pitfall"],
  mission: ["scenario"],
  configuration: ["config"],
  plugin: ["workbench", "plugin"],
  particles: ["particle"],
  emitter: ["particle"],
  vfx: ["particle"],
  fx: ["particle"],
  spawning: ["spawn"],
  gamemode: ["gamemode", "scenario"],
  debugging: ["debug"],
};

/** Query tokens plus synonym expansions plus stems of both. */
export function expandQuery(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    out.add(stem(t));
    for (const syn of SYNONYMS[t] ?? SYNONYMS[stem(t)] ?? []) {
      out.add(syn);
      out.add(stem(syn));
    }
  }
  return [...out].filter(Boolean);
}
