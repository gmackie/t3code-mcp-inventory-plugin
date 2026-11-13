// Pure HTML renderer shared by the ui:// view (bundled into the browser) and
// the tests. All dynamic text goes through esc().
import type { InventoryResult } from "../scan.ts";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const time = (iso: string) => new Date(iso).toLocaleString();
const pill = (label: string, tone: string) => `<span class="pill pill-${esc(tone)}">${esc(label)}</span>`;
const fileTone = { found: "positive", missing: "muted", error: "negative" } as const;

export function renderInventory(data: InventoryResult, options: { busy?: boolean; error?: string } = {}): string {
  const servers = data.servers.length
    ? data.servers
        .map((server) => {
          const target = server.command ? [server.command, ...server.args].join(" ") : (server.url ?? "");
          return `<li class="row">
  <div class="row-main">
    <div class="row-title">${esc(server.name)}</div>
    <div class="row-meta">${pill(server.transport, "active")}${pill(server.source, "neutral")}</div>
    <div class="row-detail mono">${esc(target)}</div>
    ${server.environmentNames.length ? `<div class="row-detail">Env: <span class="mono">${server.environmentNames.map(esc).join(", ")}</span></div>` : ""}
  </div>
</li>`;
        })
        .join("\n")
    : `<li class="empty">No MCP servers configured in the scanned files.</li>`;
  const files = data.files
    .map(
      (file) => `<li class="row"><div class="row-main"><div class="row-detail mono">${esc(file.path)}</div><div class="row-meta">${pill(file.status, fileTone[file.status])}${pill(file.source, "neutral")}${file.status === "found" ? `<span>${esc(file.servers)} servers</span>` : ""}${file.detail ? `<span>${esc(file.detail)}</span>` : ""}</div></div></li>`,
    )
    .join("\n");
  const skipped = data.skipped.map((entry) => `<p class="notice" role="status">${esc(entry.reason)}</p>`).join("");
  return `<header>
  <h1>MCP servers</h1>
  <div class="header-meta"><span>Refreshed ${esc(time(data.refreshedAt))}</span><button type="button" data-action="refresh" ${options.busy ? "disabled" : ""}>Refresh</button></div>
</header>
${data.projectRoot ? `<p class="subject mono">${esc(data.projectRoot)}</p>` : ""}
${options.error ? `<p class="error" role="alert">${esc(options.error)}</p>` : ""}
${skipped}
<section aria-label="Servers"><h2>Servers <span class="count">${data.servers.length}</span></h2><ul>${servers}</ul></section>
<section aria-label="Configuration files"><h2>Configuration files</h2><ul>${files || `<li class="empty">No configuration sources selected.</li>`}</ul></section>`;
}

export const STYLES = `
:root { color-scheme: light dark; --fg: #1f2328; --muted: #656d76; --bg: transparent; --line: #d0d7de; --accent: #0969da; --pos: #1a7f37; --neg: #cf222e; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
:root[data-theme="dark"] { --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #4493f8; --pos: #3fb950; --neg: #f85149; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #4493f8; --pos: #3fb950; --neg: #f85149; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; color: var(--fg); background: var(--bg); }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
h1 { font-size: 15px; margin: 0; } h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 16px 0 6px; }
.header-meta { display: flex; gap: 8px; align-items: center; color: var(--muted); }
ul { list-style: none; margin: 0; padding: 0; }
.row { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.row-main { flex: 1; min-width: 0; } .row-title { font-weight: 500; overflow-wrap: anywhere; }
.row-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: 12px; margin-top: 2px; }
.row-detail { color: var(--muted); font-size: 12px; margin-top: 2px; overflow-wrap: anywhere; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.count { font-weight: 400; } .empty { color: var(--muted); padding: 8px 0; border-top: 1px solid var(--line); }
.pill { border: 1px solid currentColor; border-radius: 999px; padding: 0 7px; font-size: 11px; line-height: 17px; }
.pill-active { color: var(--accent); } .pill-positive { color: var(--pos); } .pill-negative { color: var(--neg); } .pill-neutral, .pill-muted { color: var(--muted); }
button { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); } button:disabled { opacity: .5; cursor: default; }
.subject { margin: 6px 0 0; color: var(--muted); overflow-wrap: anywhere; }
.notice { color: var(--muted); margin: 8px 0 0; } .error { color: var(--neg); }
`;
