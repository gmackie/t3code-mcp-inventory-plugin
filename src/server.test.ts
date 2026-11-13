import { describe, expect, it } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import { loadConfig, type InventoryConfig } from "./config.ts";
import type { InventoryResult } from "./scan.ts";
import { connectedClient, fixture } from "./testing.ts";

type Structured<T> = { structuredContent?: T; isError?: boolean; content: { type: string; text?: string }[] };
const call = async <T = InventoryResult>(client: Awaited<ReturnType<typeof connectedClient>>["client"], args: Record<string, unknown> = {}) =>
  (await client.callTool({ name: "mcp_inventory", arguments: args })) as unknown as Structured<T>;

const files = {
  "home/.claude.json": { mcpServers: { shared: { command: "old" }, github: { type: "http", url: "https://api.example.test/mcp?api_key=sk-live-1" } }, projects: {} },
  "home/.cursor/mcp.json": { mcpServers: { cursorOnly: { command: "uvx", args: ["server", "--token", "sk-secret"] } } },
  "project/.mcp.json": { mcpServers: { shared: { command: "new", env: { API_KEY: "sk-project" } } } },
  "project/.vscode/mcp.json": { servers: { vscode: { type: "stdio", command: "node", args: ["server.js"] } } },
};

describe("MCP inventory server", () => {
  it("links the inventory tool to its ui:// view for the model and the panel", async () => {
    const { config } = await fixture();
    const { client } = await connectedClient(() => config);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["mcp_inventory"]);
    expect(tools[0]?._meta).toMatchObject({ ui: { resourceUri: "ui://mcp-inventory/inventory.html", visibility: ["model", "app"] } });
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
  });

  it("serves the view as a self-contained MCP App resource", async () => {
    const { config } = await fixture();
    const { client } = await connectedClient(() => config);
    const { resources } = await client.listResources();
    expect(resources.map((resource) => [resource.uri, resource.mimeType])).toEqual([["ui://mcp-inventory/inventory.html", RESOURCE_MIME_TYPE]]);
    const { contents } = await client.readResource({ uri: "ui://mcp-inventory/inventory.html" });
    const html = (contents[0] as { text: string }).text;
    expect(html).toStartWith("<!doctype html>");
    expect(html).toContain("ui/initialize");
    // T3's sandbox CSP is default-src 'none': nothing may load from outside.
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
    expect(html.length).toBeLessThan(100_000);
  });

  it("merges project and user configuration without exposing secrets", async () => {
    const { config, projectRoot } = await fixture(files);
    const { client } = await connectedClient(() => config);
    const result = await call(client, { projectRoot });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent!;
    expect(data.projectRoot).toBe(projectRoot);
    expect(Object.fromEntries(data.servers.map((server) => [server.name, server]))).toMatchObject({
      shared: { command: "new", source: "project", environmentNames: ["API_KEY"] },
      github: { transport: "streamable-http", url: "https://api.example.test/mcp?api_key=[redacted]", source: "user" },
      cursorOnly: { args: ["server", "--token", "[redacted]"] },
      vscode: { transport: "stdio", command: "node", source: "project" },
    });
    expect(data.files.filter((file) => file.status === "found")).toHaveLength(4);
    expect(data.files.find((file) => file.path.endsWith(join("project", ".cursor", "mcp.json")))?.status).toBe("missing");
    const wire = JSON.stringify(result);
    for (const secret of ["sk-live-1", "sk-secret", "sk-project"]) expect(wire).not.toContain(secret);
    expect(result.content[0]?.text).toContain("4 MCP servers from 4 configuration files.");
  });

  it("scans only user configuration and says so when no project folder is given", async () => {
    const { config } = await fixture(files);
    const { client } = await connectedClient(() => config);
    const result = await call(client);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.servers.map((server) => server.name).sort()).toEqual(["cursorOnly", "github", "shared"]);
    expect(result.structuredContent?.skipped).toEqual([{ source: "project", reason: expect.stringContaining("No project folder") }]);
    expect(result.content[0]?.text).toContain("project-level MCP configuration was not scanned");
  });

  it("honours the configured and requested sources", async () => {
    const { config, projectRoot } = await fixture(files);
    const projectOnly = await connectedClient(() => ({ ...config, sources: ["project"] }));
    expect((await call(projectOnly.client, { projectRoot })).structuredContent?.files.every((file) => file.source === "project")).toBe(true);
    const { client } = await connectedClient(() => config);
    expect((await call(client, { projectRoot, sources: ["user"] })).structuredContent?.servers.map((server) => server.source)).not.toContain("project");
  });

  it("reports bad configuration as a tool error", async () => {
    const { client } = await connectedClient(() => loadConfig({ MCP_INVENTORY_SOURCES: "project,global" }));
    const result = await call(client);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_INVENTORY_SOURCES has unknown sources: global");

    const relative = await connectedClient(() => loadConfig({ MCP_INVENTORY_USER_FILES: "mcp.json" }));
    expect((await call(relative.client)).content[0]?.text).toContain("MCP_INVENTORY_USER_FILES needs absolute paths");
  });

  it("rejects a relative or missing project folder", async () => {
    const { config, root } = await fixture();
    const { client } = await connectedClient(() => config);
    const relative = await call(client, { projectRoot: "project" });
    expect(relative.isError).toBe(true);
    expect(relative.content[0]?.text).toContain("must be an absolute path");
    const missing = await call(client, { projectRoot: join(root, "nope") });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]?.text).toContain("Project folder not found");
  });

  it("keeps the rest of the inventory when a file is invalid or unreadable, without echoing it", async () => {
    const { config, projectRoot, root } = await fixture({ ...files, "project/.mcp.json": '{"mcpServers": {"x": {"env": {"TOKEN": "sk-broken"' });
    const unreadable = join(root, "home/.cursor/mcp.json");
    await chmod(unreadable, 0o000);
    try {
      const { client } = await connectedClient(() => config);
      const result = await call(client, { projectRoot });
      expect(result.isError).toBeFalsy();
      const byPath = new Map(result.structuredContent!.files.map((file) => [file.path, file]));
      expect(byPath.get(join(projectRoot, ".mcp.json"))).toMatchObject({ status: "error", detail: "Not valid JSON." });
      if (process.getuid?.() !== 0) expect(byPath.get(unreadable)).toMatchObject({ status: "error", detail: "Permission denied." });
      expect(result.structuredContent?.servers.map((server) => server.name)).toContain("github");
      expect(JSON.stringify(result)).not.toContain("sk-broken");
      expect(result.content[0]?.text).toContain("Unreadable:");
    } finally {
      await chmod(unreadable, 0o644);
    }
  });
});

describe("config", () => {
  it("defaults to both sources and the home user files", () => {
    const config: InventoryConfig = loadConfig({});
    expect(config.sources).toEqual(["project", "user"]);
    expect(config.userFiles.some((file) => file.endsWith(".claude.json"))).toBe(true);
    expect(loadConfig({ MCP_INVENTORY_SOURCES: " User " }).sources).toEqual(["user"]);
  });
});
