/**
 * wb_entity_duplicate renders its own partial-success messages for failed
 * secondary calls. The client turns an in-band `status: "error"` into a throw
 * unless the caller opts out, so these tests pin that the tool opts out where it
 * has a better message to give (and that the file it already wrote is reported).
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { WorkbenchClient, WorkbenchCallOptions } from "../../src/workbench/client.js";
import { registerWbEntityDuplicate } from "../../src/tools/wb-entity-duplicate.js";
import type { Config } from "../../src/config.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

const root = mkdtempSync(join(tmpdir(), "emcp-entity-dup-"));
const projectPath = join(root, "addons");
const gamePath = join(root, "game");
mkdirSync(join(projectPath, "MyMod"), { recursive: true });
writeFileSync(join(projectPath, "MyMod", "MyMod.gproj"), "GameProject {\n}\n");
mkdirSync(join(gamePath, "addons", "data", "Prefabs", "Props"), { recursive: true });
writeFileSync(join(gamePath, "addons", "data", "Prefabs", "Props", "Crate.et"), "GenericEntity {\n}\n");
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * Mirrors the real client's finishCall: a `status: "error"` response throws
 * unless the call opted out with tolerateErrorStatus.
 */
function fakeClient(responses: Record<string, Record<string, unknown>>): WorkbenchClient {
  const state = { connected: true, mode: "edit", lastUpdated: Date.now() };
  return {
    get state() { return state; },
    async call(fn: string, _params: Record<string, unknown>, options: WorkbenchCallOptions = {}) {
      const response = responses[fn] ?? { status: "ok" };
      if (response.status === "error" && !options.tolerateErrorStatus) {
        throw new Error(String(response.message));
      }
      return response;
    },
    async refreshState() { return state; },
  } as unknown as WorkbenchClient;
}

function handler(client: WorkbenchClient): Handler {
  let captured: Handler | undefined;
  registerWbEntityDuplicate(
    { registerTool: (_name: string, _schema: unknown, h: Handler) => { captured = h; } } as never,
    { projectPath, gamePath } as Config,
    client
  );
  return captured!;
}

describe("wb_entity_duplicate", () => {
  it("reports the saved file when registration fails in-band", async () => {
    const run = handler(fakeClient({
      EMCP_WB_Prefabs: { status: "ok", ancestorPath: "{0123456789ABCDEF}Prefabs/Props/Crate.et" },
      EMCP_WB_Resources: { status: "error", message: "Resource is locked" },
    }));

    const result = await run({ entityName: "Crate_01", destPath: "Prefabs/MyCrate.et", modName: "MyMod", replaceInScene: false });
    const text = result.content[0].text;

    expect(result.isError).toBe(true);
    expect(text).toContain("Prefab saved but registration failed: Resource is locked");
    expect(text).toContain(join(projectPath, "MyMod", "Prefabs", "MyCrate.et"));
    expect(existsSync(join(projectPath, "MyMod", "Prefabs", "MyCrate.et"))).toBe(true);
  });

  it("flags a failed ancestor lookup as an error without writing anything", async () => {
    const run = handler(fakeClient({
      EMCP_WB_Prefabs: { status: "error", message: "Entity not found: Ghost" },
    }));

    const result = await run({ entityName: "Ghost", destPath: "Prefabs/Ghost.et", modName: "MyMod", replaceInScene: false });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Could not get ancestor prefab for 'Ghost': Entity not found: Ghost");
    expect(existsSync(join(projectPath, "MyMod", "Prefabs", "Ghost.et"))).toBe(false);
  });
});
