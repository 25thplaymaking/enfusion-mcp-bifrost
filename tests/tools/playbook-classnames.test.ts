import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLAYBOOKS = join(REPO, "data", "kb", "playbooks");
const API_DIR = join(REPO, "data", "api");

/** Every class name the engine actually defines. */
function engineClasses(): Set<string> {
  const names = new Set<string>();
  for (const f of ["arma-classes.json", "enfusion-classes.json"]) {
    const parsed = JSON.parse(readFileSync(join(API_DIR, f), "utf-8")) as Array<{ name: string }>;
    for (const c of parsed) names.add(c.name);
  }
  return names;
}

/**
 * Only names that LOOK like engine classes. `SCR_*`, and anything ending in a
 * component/manager suffix, are treated as class references — a playbook's
 * lowercase snake_case identifiers and filenames are not.
 */
const CLASS_LIKE = /^`((?:SCR_)?[A-Z][A-Za-z0-9_]*(?:Component|ManagerComponent|ComponentClass|Controller|Simulation|Node))`/g;

/**
 * Names the engine itself does not define, but which are correct anyway and must
 * not be "fixed". Each is here with the reason it is legitimate.
 */
const ALLOWED_ABSENT = new Map<string, string>([
  // Documented by the BI wiki with this exact spelling; kept only where a
  // playbook deliberately quotes the wiki in order to correct it.
  ["SCR_VehicleDamageMangerComponent", "BI wiki misspelling, quoted to warn against it"],
]);

describe("playbook class names exist in the engine", () => {
  // Found by accident: add-a-vehicle.md cited SCR_VehicleDamageMangerComponent
  // with a "(sic)" note. The typo was copied from the official BI wiki, which
  // spells it "Manger". The engine defines ...Manager. A playbook is a thing an
  // agent copies from verbatim, so a wiki typo in it becomes a compile error.
  //
  // This validates every class-shaped name against the engine's own class index
  // rather than trusting the KB, which inherited the typo.

  const classes = engineClasses();
  const files = readdirSync(PLAYBOOKS).filter((f) => f.endsWith(".md"));

  it("loaded the engine class index", () => {
    expect(classes.size).toBeGreaterThan(5000);
    // Sanity: a couple of names we know are real.
    expect(classes.has("SCR_VehicleDamageManagerComponent")).toBe(true);
  });

  it.each(files)("%s cites only engine-defined class names", (file) => {
    const text = readFileSync(join(PLAYBOOKS, file), "utf-8");
    const cited = new Set<string>();
    for (const m of text.matchAll(CLASS_LIKE)) cited.add(m[1]);

    const unknown = [...cited].filter(
      (n) => !classes.has(n) && !ALLOWED_ABSENT.has(n)
    );
    expect(
      unknown,
      `Class names not found in the engine index (possible wiki typos — verify against ` +
        `data/api/arma-classes.json and use the engine spelling): ${unknown.join(", ")}`
    ).toEqual([]);
  });

  it("every ALLOWED_ABSENT entry is still quoted only as a warning", () => {
    for (const [name, reason] of ALLOWED_ABSENT) {
      for (const file of files) {
        const text = readFileSync(join(PLAYBOOKS, file), "utf-8");
        if (!text.includes(name)) continue;
        const idx = text.indexOf(name);
        const around = text.slice(Math.max(0, idx - 300), idx + 300);
        expect(
          /\b(misspell|typo|not the engine|wrong|actually|correctly spelled|wiki)\b/i.test(around),
          `${file} contains "${name}" (${reason}) without explaining it is wrong. Either ` +
            `fix the spelling or make the warning explicit.`
        ).toBe(true);
      }
    }
  });
});
