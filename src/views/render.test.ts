import { describe, expect, it } from "bun:test";

import type { InventoryResult } from "../scan.ts";
import { renderInventory } from "./render.ts";

const data: InventoryResult = {
  projectRoot: "/work/app",
  sources: ["user", "project"],
  servers: [
    { name: "<img onerror=x>", transport: "stdio", command: "npx", args: ["-y", "server"], environmentNames: ["API_KEY"], source: "project" },
    { name: "remote", transport: "sse", url: "https://mcp.example.test", args: [], environmentNames: [], source: "user" },
  ],
  files: [
    { source: "project", path: "/work/app/.mcp.json", status: "found", servers: 1 },
    { source: "user", path: "/home/u/.claude.json", status: "error", servers: 0, detail: "Not valid JSON." },
  ],
  skipped: [],
  refreshedAt: "2026-11-13T00:00:00.000Z",
};

describe("inventory view", () => {
  it("escapes server data and shows each server's launch target and env names", () => {
    const html = renderInventory(data);
    expect(html).toContain("&lt;img onerror=x&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain("npx -y server");
    expect(html).toContain("https://mcp.example.test");
    expect(html).toContain("API_KEY");
    expect(html).toContain('Servers <span class="count">2</span>');
  });

  it("shows file problems, skipped sources and errors instead of an empty list", () => {
    const html = renderInventory(
      { ...data, servers: [], skipped: [{ source: "project", reason: "No project folder was given." }] },
      { busy: true, error: "Project folder not found" },
    );
    expect(html).toContain("Not valid JSON.");
    expect(html).toContain('role="status">No project folder was given.');
    expect(html).toContain('role="alert">Project folder not found');
    expect(html).toContain("No MCP servers configured in the scanned files.");
    expect(html).toContain('data-action="refresh" disabled');
  });
});
