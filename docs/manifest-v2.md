# MCP inventory manifest v2 (T3CODE-75)

`t3-plugin.json` follows the MCP-native plugin design approved on T3CODE-74, the same shape as the Bob plugin (v0.2.1). T3 loads it into its server-owned MCP registry.

## Shape

- `mcpServer` reuses `McpServerConfig` and `McpServerVariable` from Settings → Tools (`packages/contracts/src/agentTools.ts`):
  - `name`: `mcp-inventory`.
  - `transport`: stdio, `bun ${pluginRoot}/src/mcp.ts`, with `env` as `McpServerVariable[]`.
  - Nothing here is a secret, so no variable is `sensitive`.
- `contributes.panels[]` has one panel, `mcp-inventory` (`scope: project`). It renders `ui://mcp-inventory/inventory.html` and scans the folder T3 gives in `hostContext.t3.cwd`.
- `contributes.commands[]` has `mcp-inventory-open`, which opens that panel. Opening it runs a fresh scan.
- `t3Tools` is `[]`. The plugin reads configuration files itself and never calls T3.

There is no `runtime`, `settings`, `settingsPanels`, or `capabilities`.

## v1 → v2 mapping

The v1 manifest's last version is at commit 9b63472.

| v1 | v2 |
|---|---|
| `runtime` (managed-app, `bun src/stdio.ts`) | `mcpServer.transport` (stdio, `bun ${pluginRoot}/src/mcp.ts`) |
| Plugin RPC `surface.get`, `panel.get`, `workflow.get`, `action.execute` | Removed. They only returned a generic "Plugin surface ready" stub. The tool `mcp_inventory` and its `ui://` view replace them. |
| `panels[mcp.inventory]` (`surface: project`) | `panels[mcp-inventory]`, `scope: project` |
| `commands[mcp.inventory.refresh]` | `commands[mcp-inventory-open]` opens the panel, which scans on open. The view also has a Refresh button. v2 commands can only open panels. |
| `settings[mcp.inventory.sources]` (default `project,user`) | `MCP_INVENTORY_SOURCES` (same default and format). The tool's `sources` argument overrides it per call. |
| `settingsPanels[mcp.inventory.settings]` | The `title` and `description` on each variable, shown in T3's install form |
| `capabilities.filesystem.read` `project.root` | The server reads `.vscode/mcp.json`, `.cursor/mcp.json` and `.mcp.json` under the `projectRoot` tool argument. Panels pass `hostContext.t3.cwd`. |
| `capabilities.filesystem.read` `user.config.mcp` | The server reads `~/.cursor/mcp.json` and `~/.claude.json`, or the paths in `MCP_INVENTORY_USER_FILES` |
| `capabilities.ui.embed` (`project`) | Implied by `panels` |
| `hooks` | None in v1 |

## Server rules

- **Visibility.** `mcp_inventory` is `["model", "app"]`. Agents can read the inventory, and the panel calls the same tool. It is read-only (`readOnlyHint`) and touches no network (`openWorldHint: false`).
- **Secrets.** Environment variables are reported by name only. URL credentials and query values, `--token`/`--api-key`-style flag values, secret-named headers such as `--header "Authorization: Bearer …"` or `X-API-Key: …`, and `Bearer …`/`Basic …` credentials anywhere in an argument come back as `[redacted]`. A file that fails to parse is reported as "Not valid JSON." and its contents are never echoed.
- **Errors.** An unknown source in `MCP_INVENTORY_SOURCES`, a relative `MCP_INVENTORY_USER_FILES` entry, or a relative or missing `projectRoot` is a tool error with a message the user can act on. A missing config file is listed as `missing`. An unreadable or invalid file is listed as `error`, and the rest of the inventory is still returned.
- **No project folder.** Without `projectRoot`, only user-level files are scanned, and the result says the project layer was skipped. It never guesses from the process's working directory, because the pool copy of the plugin does not run in the project.
- **Stateless.** Every call re-reads the files. No state is kept in memory or on disk, so session copies and the pool copy always agree.

## Open questions

1. **Mobile panel context.** A project panel scans `hostContext.t3.cwd`. If a client leaves it out, the panel shows user-level servers and says the project layer was skipped.
2. **Remote environments.** Files are read on the machine that runs the plugin, which is the T3 server's machine. That matches v1's `filesystem.read` grant.
