import type { McpServerSummary, McpServerTransport } from "./types.ts";

type RawServer = { command?: unknown; args?: unknown; url?: unknown; type?: unknown; env?: unknown; environment?: unknown };

export function parseInventory(input: unknown, source: McpServerSummary["source"]): readonly McpServerSummary[] {
  const servers = input && typeof input === "object" ? (input as { mcpServers?: unknown }).mcpServers : undefined;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  return Object.entries(servers).flatMap(([name, raw]): McpServerSummary[] => {
    if (!raw || typeof raw !== "object") return [];
    const value = raw as RawServer;
    const command = typeof value.command === "string" ? value.command : undefined;
    const url = typeof value.url === "string" ? value.url : undefined;
    const transport = normalizeTransport(value.type, url, command);
    const args = Array.isArray(value.args) ? value.args.filter((arg): arg is string => typeof arg === "string") : [];
    const environment = value.env ?? value.environment;
    const environmentNames = environment && typeof environment === "object" && !Array.isArray(environment)
      ? Object.keys(environment)
      : [];
    if (!command && !url) return [];
    return [{ name, transport, args, environmentNames, source, ...(command ? { command } : {}), ...(url ? { url } : {}) }];
  });
}

export function mergeInventories(...inventories: readonly (readonly McpServerSummary[])[]): readonly McpServerSummary[] {
  const result = new Map<string, McpServerSummary>();
  for (const inventory of inventories) for (const server of inventory) result.set(server.name, server);
  return [...result.values()];
}

function normalizeTransport(type: unknown, url: string | undefined, command: string | undefined): McpServerTransport {
  if (type === "sse" || type === "streamable-http" || type === "stdio") return type;
  if (url) return "streamable-http";
  if (command) return "stdio";
  return "unknown";
}
