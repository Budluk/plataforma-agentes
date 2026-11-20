// Format-agnostic document model for operator reports. Pure types only: the
// same report can be rendered for browser print or any other output.

export type ReportStyle = "title" | "heading" | "body" | "muted";

export interface ReportTextBlock {
  kind: "text";
  text: string;
  style?: ReportStyle;
}

export interface ReportTableBlock {
  kind: "table";
  headers: string[];
  rows: (string | number | null)[][];
}

export interface ReportSpaceBlock {
  kind: "space";
  points?: number;
}

export type ReportBlock = ReportTextBlock | ReportTableBlock | ReportSpaceBlock;

export interface ReportDocument {
  title: string;
  subtitle?: string;
  /** Explicit, formatted by the caller. Renderers never read the clock. */
  generatedAt: string;
  blocks: ReportBlock[];
}
