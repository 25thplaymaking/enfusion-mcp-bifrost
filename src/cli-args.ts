/**
 * Pure argument handling for the agent CLI (src/cli.ts): reads a tool's zod
 * shape, turns shell flags into a typed input object, and explains failures in
 * words an agent can act on. No I/O here, so it is unit-testable. ADR-0008.
 */

import { z, type ZodRawShape, type ZodTypeAny } from "zod";

export type ParamKind =
  | "string" | "number" | "integer" | "boolean" | "enum"
  | "array" | "object" | "union" | "json";

export interface ParamInfo {
  name: string;
  kind: ParamKind;
  /** For arrays: the kind of one element. */
  item?: ParamKind;
  /** For enums (and arrays of enums): the allowed values. */
  values?: string[];
  required: boolean;
  default?: unknown;
  description: string;
}

export class UsageError extends Error {}

/** Strip wrappers until the base type, collecting description, optionality and default. */
function unwrap(schema: ZodTypeAny): { base: ZodTypeAny; optional: boolean; def?: unknown; hasDefault: boolean; description: string } {
  let s: ZodTypeAny = schema;
  let optional = false;
  let hasDefault = false;
  let def: unknown;
  let description = schema.description ?? "";
  for (let i = 0; i < 20; i++) {
    const d = s._def as { typeName?: string; innerType?: ZodTypeAny; schema?: ZodTypeAny; type?: ZodTypeAny; getter?: () => ZodTypeAny; defaultValue?: () => unknown };
    if (d.typeName === "ZodOptional" || d.typeName === "ZodNullable") { optional = true; s = d.innerType!; }
    else if (d.typeName === "ZodDefault") { hasDefault = true; def = d.defaultValue!(); s = d.innerType!; }
    else if (d.typeName === "ZodEffects") s = d.schema!;
    else if (d.typeName === "ZodBranded") s = d.type!;
    else if (d.typeName === "ZodLazy") s = d.getter!();
    else break;
    if (!description && s.description) description = s.description;
  }
  return { base: s, optional, def, hasDefault, description };
}

function kindOf(base: ZodTypeAny): { kind: ParamKind; values?: string[] } {
  const d = base._def as { typeName?: string; values?: unknown; value?: unknown; checks?: Array<{ kind: string }> };
  switch (d.typeName) {
    case "ZodString": return { kind: "string" };
    case "ZodNumber": return { kind: d.checks?.some((c) => c.kind === "int") ? "integer" : "number" };
    case "ZodBoolean": return { kind: "boolean" };
    case "ZodEnum": return { kind: "enum", values: [...(d.values as string[])] };
    case "ZodNativeEnum": return { kind: "enum", values: Object.values(d.values as object).filter((v) => typeof v === "string") as string[] };
    case "ZodLiteral": return { kind: "enum", values: [String(d.value)] };
    case "ZodArray": return { kind: "array" };
    case "ZodObject": case "ZodRecord": return { kind: "object" };
    case "ZodUnion": case "ZodDiscriminatedUnion": return { kind: "union" };
    default: return { kind: "json" };
  }
}

export function describeParams(shape: ZodRawShape): ParamInfo[] {
  return Object.entries(shape).map(([name, schema]) => {
    const u = unwrap(schema as ZodTypeAny);
    const k = kindOf(u.base);
    const info: ParamInfo = {
      name,
      kind: k.kind,
      required: !u.optional && !u.hasDefault,
      description: u.description,
    };
    if (k.values) info.values = k.values;
    if (u.hasDefault) info.default = u.def;
    if (k.kind === "array") {
      const el = unwrap((u.base._def as { type: ZodTypeAny }).type);
      const ek = kindOf(el.base);
      info.item = ek.kind;
      if (ek.values) info.values = ek.values;
    }
    return info;
  });
}

/** Which params bare words fill, in order: the required ones, else a lone `query`. */
export function positionalParams(params: ParamInfo[]): string[] {
  const required = params.filter((p) => p.required).map((p) => p.name);
  if (required.length) return required;
  return params.some((p) => p.name === "query") ? ["query"] : [];
}

const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, "");

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Candidates a mistyped name probably meant: close in spelling, or containing it. */
export function nearest(wanted: string, candidates: string[], max = 4): string[] {
  const w = norm(wanted);
  return candidates
    .map((c) => ({ c, d: distance(w, norm(c)), sub: w.length > 2 && (norm(c).includes(w) || w.includes(norm(c))) }))
    .filter((x) => x.sub || x.d <= Math.max(2, Math.floor(w.length / 4)))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.c);
}

function parseJson(raw: string, flag: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new UsageError(`${flag} expects ${what} as JSON, got: ${raw.length > 80 ? raw.slice(0, 80) + "..." : raw}`);
  }
}

function coerceScalar(kind: ParamKind, raw: string, flag: string, values?: string[]): unknown {
  switch (kind) {
    case "number":
    case "integer": {
      const n = Number(raw);
      if (raw.trim() === "" || Number.isNaN(n)) throw new UsageError(`${flag} expects a number, got "${raw}"`);
      if (kind === "integer" && !Number.isInteger(n)) throw new UsageError(`${flag} expects a whole number, got "${raw}"`);
      return n;
    }
    case "boolean": {
      const v = raw.toLowerCase();
      if (["true", "1", "yes", "on"].includes(v)) return true;
      if (["false", "0", "no", "off"].includes(v)) return false;
      throw new UsageError(`${flag} expects true or false, got "${raw}"`);
    }
    case "enum":
      if (values && !values.includes(raw)) throw new UsageError(`${flag} must be one of: ${values.join(", ")} (got "${raw}")`);
      return raw;
    case "object":
    case "json":
      return parseJson(raw, flag, "an object");
    case "union": {
      // A union of scalars (e.g. string | number) or a tuple: try JSON, fall back to text.
      try { return JSON.parse(raw); } catch { return raw; }
    }
    default:
      return raw;
  }
}

function coerce(p: ParamInfo, raws: string[], flag: string): unknown {
  if (p.kind === "array") {
    if (raws.length === 1 && raws[0].trim().startsWith("[")) return parseJson(raws[0], flag, "an array");
    const item = p.item ?? "string";
    return raws.map((r) => (item === "object" || item === "json") ? parseJson(r, flag, "an object per item") : coerceScalar(item, r, flag, p.values));
  }
  if (raws.length > 1) throw new UsageError(`${flag} was given ${raws.length} times but takes one value`);
  return coerceScalar(p.kind, raws[0], flag, p.values);
}

const BOOL_WORDS = new Set(["true", "false", "1", "0", "yes", "no", "on", "off"]);

/**
 * Turn the words after a tool name into that tool's input object.
 * `--name value`, `--name=value`, bare `--flag` (booleans), `--no-flag`, repeated
 * flags for arrays, bare words for the positional params. Flag names match the
 * schema ignoring case, `-` and `_`, so `--project-path` finds `projectPath`.
 */
export function parseToolArgs(tokens: string[], params: ParamInfo[], base: Record<string, unknown> = {}): Record<string, unknown> {
  const byNorm = new Map(params.map((p) => [norm(p.name), p]));
  const collected = new Map<string, string[]>();
  const bools = new Map<string, boolean>();
  const bare: string[] = [];

  const find = (raw: string): ParamInfo => {
    const p = byNorm.get(norm(raw));
    if (!p) {
      const names = params.map((x) => `--${x.name}`).join(", ") || "(this tool takes no parameters)";
      const near = nearest(raw, params.map((x) => x.name)).map((n) => `--${n}`);
      throw new UsageError(`Unknown flag --${raw}.${near.length ? ` Did you mean ${near.join(" or ")}?` : ""} Valid flags: ${names}`);
    }
    return p;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--") { bare.push(...tokens.slice(i + 1)); break; }
    if (!t.startsWith("--")) { bare.push(t); continue; }
    const body = t.slice(2);
    const eq = body.indexOf("=");
    const key = eq >= 0 ? body.slice(0, eq) : body;
    let p = byNorm.get(norm(key));
    if (!p && eq < 0 && /^no-/i.test(key)) {
      const neg = byNorm.get(norm(key.slice(3)));
      if (neg?.kind === "boolean") { bools.set(neg.name, false); continue; }
    }
    p = p ?? find(key);
    let value: string | undefined = eq >= 0 ? body.slice(eq + 1) : undefined;
    if (value === undefined) {
      const next = tokens[i + 1];
      if (p.kind === "boolean") {
        if (next !== undefined && BOOL_WORDS.has(next.toLowerCase())) { value = next; i++; }
        else { bools.set(p.name, true); continue; }
      } else {
        if (next === undefined || next.startsWith("--")) throw new UsageError(`--${p.name} needs a value (${p.kind})`);
        value = next; i++;
      }
    }
    collected.set(p.name, [...(collected.get(p.name) ?? []), value]);
  }

  const positional = positionalParams(params);
  if (bare.length > positional.length) {
    const hint = positional.length
      ? `This tool takes ${positional.length} bare value(s): ${positional.join(", ")}.`
      : "This tool takes no bare values.";
    throw new UsageError(`Unexpected value "${bare[positional.length]}". ${hint} Pass the rest as --flags (quote values with spaces).`);
  }
  bare.forEach((v, i) => {
    const name = positional[i];
    if (collected.has(name)) throw new UsageError(`${name} given both as a bare value and as --${name}`);
    collected.set(name, [v]);
  });

  const out: Record<string, unknown> = { ...base };
  for (const [name, raws] of collected) {
    const p = params.find((x) => x.name === name)!;
    out[name] = coerce(p, raws, `--${name}`);
  }
  for (const [name, v] of bools) out[name] = v;
  return out;
}

/** Validate against the tool's own schema (applying its defaults), with readable errors. */
export function validateInput(shape: ZodRawShape, input: Record<string, unknown>): Record<string, unknown> {
  const res = z.object(shape).safeParse(input);
  if (res.success) return res.data;
  const lines = res.error.issues.map((iss) => {
    const at = iss.path.length ? `--${iss.path.join(".")}` : "input";
    return `${at}: ${iss.message}`;
  });
  throw new UsageError(lines.join("\n"));
}

/** Split one REPL / script line into words, honouring "double" and 'single' quotes. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && (line[i + 1] === '"' || line[i + 1] === "\\")) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") { quote = c; has = true; }
    else if (/\s/.test(c)) { if (has || cur) out.push(cur); cur = ""; has = false; }
    else { cur += c; has = true; }
  }
  if (quote) throw new UsageError(`Unclosed ${quote} quote`);
  if (has || cur) out.push(cur);
  return out;
}
