// Test fixtures shared by the MCP server and view-bridge tests.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import type { InventoryConfig } from "./config.ts";
import { createInventoryMcpServer } from "./server.ts";

/** A temp home and project folder; `files` maps paths relative to the temp root to contents. */
export async function fixture(files: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "mcp-inventory-"));
  await mkdir(join(root, "project"), { recursive: true });
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), typeof contents === "string" ? contents : JSON.stringify(contents));
  }
  return {
    root,
    projectRoot: join(root, "project"),
    config: { sources: ["project", "user"], userFiles: [join(root, "home/.cursor/mcp.json"), join(root, "home/.claude.json")] } satisfies InventoryConfig,
  };
}

export async function connectedClient(config: () => InventoryConfig) {
  const server = createInventoryMcpServer({ config });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-host", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}
