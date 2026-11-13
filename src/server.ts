import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { loadConfig, type InventoryConfig } from "./config.ts";
import { scanInventory } from "./scan.ts";
import { VIEWS, viewHtml, type ViewName } from "./views/html.ts";

export const SERVER_INFO = { name: "mcp-inventory", version: "0.2.0" } as const;

export type InventoryServerOptions = {
  /** Read per call, so a bad setting is a tool error rather than a dead server. */
  config?: () => InventoryConfig;
};

export function createInventoryMcpServer(options: InventoryServerOptions = {}): McpServer {
  const config = options.config ?? (() => loadConfig());
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Read-only inventory of MCP servers configured for a project folder and the user. Use mcp_inventory with the project's absolute path. It never returns environment values or URL/argument secrets, and never starts the servers.",
  });

  for (const [name, view] of Object.entries(VIEWS) as [ViewName, (typeof VIEWS)[ViewName]][]) {
    registerAppResource(server, view.title, view.uri, { mimeType: RESOURCE_MIME_TYPE, _meta: { ui: { prefersBorder: true } } }, async () => ({
      contents: [{ uri: view.uri, mimeType: RESOURCE_MIME_TYPE, text: await viewHtml(name), _meta: { ui: { prefersBorder: true } } }],
    }));
  }

  registerAppTool(
    server,
    "mcp_inventory",
    {
      title: "MCP server inventory",
      description:
        "List the MCP servers configured at project scope (.mcp.json, .cursor/mcp.json, .vscode/mcp.json in projectRoot) and user scope (~/.claude.json, ~/.cursor/mcp.json). Project entries override user entries with the same name. Reports transport, command, args, URL and environment variable names; secret values are redacted. Renders the MCP servers view.",
      inputSchema: z.object({
        projectRoot: z.string().optional().describe("Absolute path of the project folder. Without it only user-level configuration is scanned."),
        sources: z.array(z.enum(["project", "user"])).optional().describe("Configuration layers to scan; defaults to MCP_INVENTORY_SOURCES"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: VIEWS.inventory.uri, visibility: ["model", "app"] } },
    },
    async ({ projectRoot, sources }) =>
      result(async () => {
        const data = await scanInventory(config(), { ...(projectRoot ? { projectRoot } : {}), ...(sources ? { sources } : {}) });
        const lines = data.servers.map((server) => `- ${server.name} [${server.transport}, ${server.source}] ${server.command ? [server.command, ...server.args].join(" ") : (server.url ?? "")}`);
        const problems = data.files.filter((file) => file.status === "error").map((file) => `${file.path}: ${file.detail}`);
        const text = [
          `${data.servers.length} MCP servers from ${data.files.filter((file) => file.status === "found").length} configuration files.`,
          ...data.skipped.map((entry) => entry.reason),
          ...(problems.length ? [`Unreadable: ${problems.join("; ")}`] : []),
          ...lines,
        ].join("\n");
        return { data, text };
      }),
  );

  return server;
}

async function result(run: () => Promise<{ data: unknown; text: string }>): Promise<CallToolResult> {
  try {
    const { data, text } = await run();
    return { content: [{ type: "text", text }], structuredContent: data as Record<string, unknown> };
  } catch (error) {
    return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}
