import type { McpServerSummary, McpServerTransport } from "./types.ts";

type RawServer = { command?: unknown; args?: unknown; url?: unknown; type?: unknown; env?: unknown; environment?: unknown };

export function parseInventory(input: unknown, source: McpServerSummary["source"]): readonly McpServerSummary[] {
  const servers = input && typeof input === "object" ? (input as { mcpServers?: unknown }).mcpServers : undefined;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  return Object.entries(servers).flatMap(([name, raw]): McpServerSummary[] => {
    if (!raw || typeof raw !== "object") return [];
    const value = raw as RawServer;
    const command = typeof value.command === "string" ? value.command : undefined;
    const url = typeof value.url === "string" ? redactUrl(value.url) : undefined;
    const transport = normalizeTransport(value.type, url, command);
    const args = Array.isArray(value.args) ? redactArgs(value.args.filter((arg): arg is string => typeof arg === "string")) : [];
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
  // Claude Code and Cursor write `"type": "http"` for streamable HTTP.
  if (type === "http") return "streamable-http";
  if (url) return "streamable-http";
  if (command) return "stdio";
  return "unknown";
}

export const REDACTED = "[redacted]";

// Configs often carry keys in a URL (`?api_key=…`, `user:pass@`) or a flag
// (`--token sk-…`). The inventory promises never to return secret values, so
// URL credentials and query values, and the values of secret-looking flags,
// are replaced.
const SECRET_NAME = /(token|secret|password|passwd|api[-_]?key|apikey|auth|credential|bearer)/i;

export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!url.username && !url.password && !url.search) return raw;
  if (url.username) url.username = REDACTED;
  url.password = "";
  for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, REDACTED);
  return url.toString().replaceAll(encodeURIComponent(REDACTED), REDACTED);
}

export function redactArgs(args: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const assignment = /^(-{0,2}[^=\s]+)=(.+)$/.exec(arg);
    if (assignment && SECRET_NAME.test(assignment[1]!)) {
      result.push(`${assignment[1]}=${REDACTED}`);
      continue;
    }
    if (/^bearer\s+\S/i.test(arg)) {
      result.push(`Bearer ${REDACTED}`);
      continue;
    }
    result.push(/^[a-z][a-z0-9+.-]*:\/\//i.test(arg) ? redactUrl(arg) : arg);
    const next = args[index + 1];
    if (/^--?[^=\s]+$/.test(arg) && SECRET_NAME.test(arg) && next !== undefined && !next.startsWith("-")) {
      result.push(REDACTED);
      index++;
    }
  }
  return result;
}
