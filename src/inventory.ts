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
const SECRET_NAME = /(token|secret|password|passwd|api[-_]?key|apikey|auth|authorization|credential|bearer|cookie)/i;

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

const HEADER_FLAG = /^(--header|-H)$/;

// Redacts a free-form argument value: `Name: value` headers with a secret-looking
// name (`Authorization: Bearer …`, `X-API-Key: …`), then any `Bearer`/`Basic`
// credential wherever it appears, then URL credentials.
function redactValue(value: string): string {
  const header = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(value);
  if (header && SECRET_NAME.test(header[1]!)) return `${header[1]}: ${REDACTED}`;
  const scrubbed = value.replace(/\b(bearer|basic)\s+[^\s"',;]+/gi, `$1 ${REDACTED}`);
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(scrubbed) ? redactUrl(scrubbed) : scrubbed;
}

export function redactArgs(args: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const assignment = /^(-{0,2}[^=\s:]+)=(.+)$/.exec(arg);
    if (assignment && SECRET_NAME.test(assignment[1]!)) {
      result.push(`${assignment[1]}=${REDACTED}`);
      continue;
    }
    if (assignment && HEADER_FLAG.test(assignment[1]!)) {
      result.push(`${assignment[1]}=${redactValue(assignment[2]!)}`);
      continue;
    }
    result.push(redactValue(arg));
    const next = args[index + 1];
    if (HEADER_FLAG.test(arg) && next !== undefined) {
      result.push(redactValue(next));
      index++;
      continue;
    }
    if (/^--?[^=\s]+$/.test(arg) && SECRET_NAME.test(arg) && next !== undefined && !next.startsWith("-")) {
      result.push(REDACTED);
      index++;
    }
  }
  return result;
}
