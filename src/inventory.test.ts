import { describe, expect, test } from "bun:test";
import { mergeInventories, parseInventory } from "./inventory.ts";

describe("MCP inventory boundary", () => {
  test("lists server metadata without exposing environment values", () => {
    expect(parseInventory({ mcpServers: {
      filesystem: { command: "npx", args: ["-y", "server-filesystem"], env: { API_KEY: "secret" } },
      remote: { url: "https://mcp.example.test", type: "sse" },
      invalid: { env: { TOKEN: "secret" } },
    } }, "project")).toEqual([
      { name: "filesystem", transport: "stdio", command: "npx", args: ["-y", "server-filesystem"], environmentNames: ["API_KEY"], source: "project" },
      { name: "remote", transport: "sse", url: "https://mcp.example.test", args: [], environmentNames: [], source: "project" },
    ]);
  });

  test("lets project config override a user-level server by name", () => {
    const user = parseInventory({ mcpServers: { shared: { command: "old" }, userOnly: { command: "keep" } } }, "user");
    const project = parseInventory({ mcpServers: { shared: { command: "new" } } }, "project");
    expect(mergeInventories(user, project)).toEqual([
      { name: "shared", transport: "stdio", command: "new", args: [], environmentNames: [], source: "project" },
      { name: "userOnly", transport: "stdio", command: "keep", args: [], environmentNames: [], source: "user" },
    ]);
  });
});
