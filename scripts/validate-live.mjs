#!/usr/bin/env node

import { resolve, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(import.meta.dirname, "..");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(root, "dist", "index.js")],
  env: { ...process.env },
  stderr: "pipe",
});
const client = new Client({ name: "bifrost-live-validator", version: "1.0.0" });

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: "wb_validate_scripts",
    arguments: {
      configuration: process.argv[2] || "WORKBENCH",
      includeWarnings: true,
      maxDiagnostics: 200,
    },
  });
  for (const item of result.content ?? []) {
    if (item.type === "text") process.stdout.write(item.text + "\n");
  }
  if (result.isError) process.exitCode = 1;
} finally {
  await client.close();
}
