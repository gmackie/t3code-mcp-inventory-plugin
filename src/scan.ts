import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { PROJECT_FILES, type InventoryConfig, type InventorySource } from "./config.ts";
import { mergeInventories, parseInventory } from "./inventory.ts";
import type { McpServerSummary } from "./types.ts";

export type ConfigFileStatus = {
  source: InventorySource;
  path: string;
  status: "found" | "missing" | "error";
  servers: number;
  detail?: string;
};

export type InventoryResult = {
  projectRoot?: string;
  sources: readonly InventorySource[];
  servers: readonly McpServerSummary[];
  files: readonly ConfigFileStatus[];
  /** Why a requested source was not scanned, e.g. no project folder. */
  skipped: readonly { source: InventorySource; reason: string }[];
  refreshedAt: string;
};

// `~/.claude.json` grows with history; anything past this is not an MCP config.
export const MAX_CONFIG_BYTES = 20 * 1024 * 1024;

export async function scanInventory(
  config: InventoryConfig,
  options: { projectRoot?: string; sources?: readonly InventorySource[] } = {},
): Promise<InventoryResult> {
  // An explicit `sources` argument replaces the configured default.
  const requested = options.sources?.length ? options.sources : config.sources;
  const sources = ["user", "project"].filter((source): source is InventorySource => requested.includes(source as InventorySource));
  const skipped: InventoryResult["skipped"][number][] = [];
  const projectRoot = options.projectRoot?.trim() ? await projectFolder(options.projectRoot.trim()) : undefined;

  const targets: { source: InventorySource; path: string }[] = [];
  if (sources.includes("user")) for (const path of config.userFiles) targets.push({ source: "user", path });
  if (sources.includes("project")) {
    if (projectRoot) for (const file of PROJECT_FILES) targets.push({ source: "project", path: join(projectRoot, file) });
    else skipped.push({ source: "project", reason: "No project folder was given, so project-level MCP configuration was not scanned." });
  }

  const read = await Promise.all(targets.map(async (target) => ({ target, ...(await readConfigFile(target.path, target.source)) })));
  const files = read.map(({ target, servers, status, detail }): ConfigFileStatus => ({
    source: target.source,
    path: target.path,
    status,
    servers: servers.length,
    ...(detail ? { detail } : {}),
  }));
  // User entries first so a project entry with the same name wins.
  const servers = mergeInventories(...read.map((entry) => entry.servers));
  return { ...(projectRoot ? { projectRoot } : {}), sources, servers, files, skipped, refreshedAt: new Date().toISOString() };
}

async function projectFolder(raw: string): Promise<string> {
  if (!isAbsolute(raw)) throw new Error(`The project folder must be an absolute path, got "${raw}".`);
  const path = resolve(raw);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`Project folder not found: ${path}`);
  return path;
}

async function readConfigFile(
  path: string,
  source: InventorySource,
): Promise<{ status: ConfigFileStatus["status"]; servers: readonly McpServerSummary[]; detail?: string }> {
  let text: string;
  try {
    const info = await stat(path);
    if (!info.isFile()) return { status: "error", servers: [], detail: "Not a file." };
    if (info.size > MAX_CONFIG_BYTES) return { status: "error", servers: [], detail: `Larger than ${MAX_CONFIG_BYTES / 1024 / 1024} MB; skipped.` };
    text = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "missing", servers: [] };
    return { status: "error", servers: [], detail: code === "EACCES" ? "Permission denied." : "Could not be read." };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Never echo file contents: they may hold secrets.
    return { status: "error", servers: [], detail: "Not valid JSON." };
  }
  return { status: "found", servers: parseInventory(normalizeShape(json), source) };
}

// VS Code's `.vscode/mcp.json` keys servers under `servers`, not `mcpServers`.
function normalizeShape(json: unknown): unknown {
  if (!json || typeof json !== "object" || "mcpServers" in json) return json;
  const servers = (json as { servers?: unknown }).servers;
  return servers && typeof servers === "object" ? { mcpServers: servers } : json;
}
