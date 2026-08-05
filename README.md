# MCP inventory plugin

Proof-of-concept read-only plugin for discovering MCP server configuration at project and user scope. It reports transport, command, arguments, URL, and environment variable names while never returning configured secret values.

This is based on the configuration-inventory direction in [upstream PR #5227](https://github.com/pingdotgg/t3code/pull/5227). It intentionally does not start MCP servers, mutate configuration, or request network access; those are separate capabilities that a future manager plugin would need to declare.

```sh
bun install
bun test
bun run typecheck
```
