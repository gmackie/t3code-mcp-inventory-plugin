export type McpServerTransport = "stdio" | "sse" | "streamable-http" | "unknown";

export type McpServerSummary = {
  name: string;
  transport: McpServerTransport;
  command?: string;
  args: readonly string[];
  url?: string;
  environmentNames: readonly string[];
  source: "project" | "user";
};
