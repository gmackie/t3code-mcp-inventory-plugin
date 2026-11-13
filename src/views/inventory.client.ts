import type { InventoryResult } from "../scan.ts";
import { createViewBridge, toolData, type CallToolResult, type HostContext } from "./bridge.ts";
import { esc, renderInventory } from "./render.ts";

// The project panel scans the folder the host gives in hostContext.t3.cwd.
// Inline after an agent's call, the view shows that call's result instead.
const bridge = createViewBridge(window as never, { name: "mcp-inventory", version: "0.2.0" });
const root = document.getElementById("app")!;
let context: HostContext = {};
let args: Record<string, unknown> | undefined;
let data: InventoryResult | undefined;
let busy = false;
let error: string | undefined;

function draw() {
  if (data) root.innerHTML = renderInventory(data, { busy, ...(error ? { error } : {}) });
  else if (error) root.innerHTML = `<p class="error" role="alert">${esc(error)}</p><button type="button" data-action="refresh">Retry</button>`;
  else root.textContent = busy ? "Scanning MCP configuration…" : "Loading…";
}

function show(result: CallToolResult) {
  try {
    data = toolData<InventoryResult>(result);
    error = undefined;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  draw();
}

const panelArgs = () => (context.t3?.cwd ? { projectRoot: context.t3.cwd } : {});

async function refresh() {
  busy = true;
  draw();
  try {
    show(await bridge.callTool("mcp_inventory", args ?? panelArgs()));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  busy = false;
  draw();
}

bridge.onHostContext = (update) => {
  const previous = context.t3?.cwd;
  context = { ...context, ...update };
  if (context.theme) document.documentElement.dataset.theme = context.theme;
  // A panel follows the project folder; an inline tool result keeps its own arguments.
  if (data && !args && context.t3?.cwd !== previous) void refresh();
};
bridge.onToolInput = (input) => {
  args = input;
};
bridge.onToolResult = show;

root.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest<HTMLElement>("[data-action=refresh]")) void refresh();
});
new ResizeObserver(() => bridge.sendSize(document.documentElement.scrollWidth, document.documentElement.scrollHeight)).observe(document.body);

// A panel opens with no tool call, so scan if no result arrives.
void bridge.connect().then(() => setTimeout(() => void (data || error ? undefined : refresh()), 250));
