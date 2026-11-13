# MCP inventory plugin

A read-only T3 Code plugin that lists the MCP servers configured for a project and for the user. It reports transport, command, arguments, URL, and environment variable *names*. It never returns secret values, starts the servers, or changes configuration.

It is based on the configuration-inventory direction in [upstream PR #5227](https://github.com/pingdotgg/t3code/pull/5227).

The plugin is an MCP server (`src/mcp.ts`, stdio) described by a v2 manifest (`t3-plugin.json`). The managed-app runtime and plugin RPC were removed in T3CODE-75, so T3 builds that only load v1 manifests cannot load this version.

## MCP server

It is built on the official MCP TypeScript SDK v2 (`@modelcontextprotocol/server`). The view is an MCP App: a `ui://` HTML resource with the `text/html;profile=mcp-app` MIME type.

- `mcp_inventory` scans the configuration files below, merges them, and renders `ui://mcp-inventory/inventory.html`. A project entry overrides a user entry with the same name. Arguments:
  - `projectRoot` (absolute path). Without it, only user-level files are scanned.
  - `sources` (`["project", "user"]`).
- The **MCP servers** panel (project scope) opens the same view. It scans the project folder T3 provides. The command **MCP inventory: Open and refresh** opens it.

| Scope | Files |
|---|---|
| project | `.vscode/mcp.json`, `.cursor/mcp.json`, `.mcp.json` (later files win) |
| user | `~/.cursor/mcp.json`, `~/.claude.json` (top-level `mcpServers`) |

Each file is reported as `found`, `missing`, or `error`. A broken file doesn't hide the others, and its contents are never echoed.

### Configuration

| Env var | Old setting | Notes |
|---|---|---|
| `MCP_INVENTORY_SOURCES` | `mcp.inventory.sources` | `project,user` (default), `project`, or `user` |
| `MCP_INVENTORY_USER_FILES` | (new) | Optional comma-separated absolute paths that replace the default user files |

### Run it

```sh
bun install
bun test        # domain, MCP client, stdio install, view bridge, and render tests
bun run typecheck
bun run inspect # official MCP Inspector (Apps tab)
```

Install this directory through T3's plugin installer after running `bun install --frozen-lockfile`.

See `docs/manifest-v2.md` for the v1 → v2 mapping and the server rules.
