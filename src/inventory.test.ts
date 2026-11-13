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

describe("secret redaction", () => {
  test("redacts URL credentials and query values", () => {
    expect(parseInventory({ mcpServers: { a: { url: "https://user:pw@mcp.example.test/sse?key=abc&x=1" } } }, "user")[0]?.url)
      .toBe("https://[redacted]@mcp.example.test/sse?key=[redacted]&x=[redacted]");
  });

  test("redacts secret-looking flag values and bearer arguments", () => {
    expect(parseInventory({ mcpServers: { a: { command: "npx", args: ["--api-key", "sk-1", "--token=sk-2", "Bearer sk-3", "--port", "3000", "--header", "x"] } } }, "user")[0]?.args)
      .toEqual(["--api-key", "[redacted]", "--token=[redacted]", "Bearer [redacted]", "--port", "3000", "--header", "x"]);
  });

  test("redacts mcp-remote --header credentials", () => {
    const args = (raw: string[]) => parseInventory({ mcpServers: { a: { command: "npx", args: raw } } }, "user")[0]?.args;
    expect(args(["mcp-remote", "https://mcp.example.test/sse", "--header", "Authorization: Bearer sk-live-1"]))
      .toEqual(["mcp-remote", "https://mcp.example.test/sse", "--header", "Authorization: [redacted]"]);
    expect(args(["-H", "Authorization:Bearer sk-2"])).toEqual(["-H", "Authorization: [redacted]"]);
    expect(args(["--header", "X-API-Key: sk-3"])).toEqual(["--header", "X-API-Key: [redacted]"]);
    expect(args(["--header=Authorization: Bearer sk-4"])).toEqual(["--header=Authorization: [redacted]"]);
    expect(args(["--header", "Accept: application/json"])).toEqual(["--header", "Accept: application/json"]);
  });

  test("redacts bearer and secret header values anywhere in an argument", () => {
    const args = (raw: string[]) => parseInventory({ mcpServers: { a: { command: "npx", args: raw } } }, "user")[0]?.args;
    expect(args(["Authorization: Bearer sk-5", "X-API-Key: sk-6", "auth=Bearer sk-7", "token is bearer sk-8 here"]))
      .toEqual(["Authorization: [redacted]", "X-API-Key: [redacted]", "auth=[redacted]", "token is bearer [redacted] here"]);
    const out = JSON.stringify(args(["mcp-remote", "--header", "Authorization: Bearer sk-live-1", "Bearer sk-9"]));
    expect(out).not.toContain("sk-");
  });

  test("treats type http as streamable HTTP", () => {
    expect(parseInventory({ mcpServers: { a: { type: "http", url: "https://mcp.example.test" } } }, "user")[0]?.transport).toBe("streamable-http");
  });
});
