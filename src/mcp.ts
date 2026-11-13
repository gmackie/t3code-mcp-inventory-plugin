#!/usr/bin/env bun
// Stdio entry point for the MCP-native inventory plugin (manifest v2 `mcpServer`).
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createInventoryMcpServer } from "./server.ts";

await createInventoryMcpServer().connect(new StdioServerTransport());
