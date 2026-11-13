import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import type { McpServerSummary } from "./types.ts";

export type InventorySource = McpServerSummary["source"];
export const ALL_SOURCES: readonly InventorySource[] = ["project", "user"];

// The v1 setting `mcp.inventory.sources` maps onto MCP_INVENTORY_SOURCES.
// MCP_INVENTORY_USER_FILES replaces the v1 `user.config.mcp` filesystem root.
export type InventoryConfig = {
  readonly sources: readonly InventorySource[];
  readonly userFiles: readonly string[];
};

/** Project-scope config files, relative to the project folder, lowest precedence first. */
export const PROJECT_FILES = [".vscode/mcp.json", ".cursor/mcp.json", ".mcp.json"] as const;

export function defaultUserFiles(home = homedir()): string[] {
  return [join(home, ".cursor", "mcp.json"), join(home, ".claude.json")];
}

export function loadConfig(env: Record<string, string | undefined> = process.env): InventoryConfig {
  return {
    sources: parseSources(env.MCP_INVENTORY_SOURCES),
    userFiles: parseUserFiles(env.MCP_INVENTORY_USER_FILES),
  };
}

export function parseSources(raw: string | undefined): InventorySource[] {
  const value = raw?.trim();
  if (!value) return [...ALL_SOURCES];
  const entries = value.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const unknown = entries.filter((entry) => !ALL_SOURCES.includes(entry as InventorySource));
  if (unknown.length) {
    throw new Error(`MCP_INVENTORY_SOURCES has unknown sources: ${unknown.join(", ")}. Use a comma-separated list of "project" and "user".`);
  }
  return ALL_SOURCES.filter((source) => entries.includes(source));
}

function parseUserFiles(raw: string | undefined): string[] {
  const value = raw?.trim();
  if (!value) return defaultUserFiles();
  const files = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  const relative = files.filter((file) => !isAbsolute(file));
  if (relative.length) throw new Error(`MCP_INVENTORY_USER_FILES needs absolute paths: ${relative.join(", ")}`);
  return files;
}
