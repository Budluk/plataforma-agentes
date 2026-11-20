// Renders the report model as a self-contained page for the browser's
// "Print / Save as PDF" dialog. Pure function: no DOM, no I/O, no clock.
// Every dynamic value is HTML-escaped before entering the document.

import type { ReportBlock, ReportDocument, ReportStyle } from "./report";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

function cell(value: string | number | null | undefined): string {
  return esc(value === null || value === undefined ? "—" : String(value));
}

function styleClass(style: ReportStyle | undefined): string {
  const allowed: ReportStyle[] = ["title", "heading", "body", "muted"];
  return style && allowed.includes(style) ? style : "body";
}

function blockHtml(block: ReportBlock): string {
  if (block.kind === "space") {
    const points =
      typeof block.points === "number" && Number.isFinite(block.points)
        ? Math.max(0, Math.min(60, block.points))
        : 6;
    return `<div class="space" style="height:${points}px"></div>`;
  }
  if (block.kind === "text") return `<p class="${styleClass(block.style)}">${esc(block.text)}</p>`;
  const headers = block.headers.map((h) => `<th>${cell(h)}</th>`).join("");
  const rows = block.rows
    .map((row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

const CSS = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #17191c; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 10pt; line-height: 1.45; }
h1 { font-size: 20pt; margin: 0 0 3mm; }
.subtitle { color: #475569; font-size: 9pt; margin: 0 0 2mm; }
.generated { color: #64748b; font-size: 8pt; margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 1px solid #cbd5e1; }
.heading { font-size: 12pt; font-weight: 700; margin: 6mm 0 2mm; break-after: avoid; }
.body { font-size: 10pt; margin: 0 0 2mm; }
.muted { color: #475569; font-size: 8.5pt; margin: 0 0 2mm; }
.space { clear: both; }
table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 8.5pt; }
th { text-align: left; font-weight: 700; background: #f1f5f9; border-bottom: 1px solid #94a3b8; padding: 1.5mm 2mm; }
td { border-bottom: 1px solid #e2e8f0; padding: 1.5mm 2mm; vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

/** Full HTML document ready for `document.write` in the print window. */
export function renderPrintHtml(doc: ReportDocument): string {
  const subtitle = doc.subtitle ? `<p class="subtitle">${esc(doc.subtitle)}</p>` : "";
  return (
    "<!doctype html>\n" +
    '<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n' +
    `<title>${esc(doc.title)} — CentralIA</title>\n` +
    `<style>${CSS}</style>\n</head>\n<body>\n` +
    `<h1>${esc(doc.title)}</h1>\n${subtitle}\n` +
    `<p class="generated">Gerado em ${esc(doc.generatedAt)} · dados da sessão atual</p>\n` +
    `${doc.blocks.map(blockHtml).join("\n")}\n</body>\n</html>\n`
  );
}
