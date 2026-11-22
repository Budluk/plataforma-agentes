// Pure CRM primitives for Fase 3. No I/O, no clock, no database. Import data
// is validated and bounded; duplicates are only suggested, never merged.

import { z } from "zod";

export const CrmContact = z
  .object({
    id: z.string().trim().min(1).max(64),
    organization_id: z.string().trim().min(1).max(64),
    display_name: z.string().trim().min(1).max(160),
    emails: z.array(z.string().trim().max(254)).max(10),
    phones: z.array(z.string().trim().max(40)).max(10),
    document_token: z.string().trim().max(128).nullable().default(null),
    company_id: z.string().trim().max(64).nullable().default(null),
    source: z.string().trim().max(80).nullable().default(null),
    tags: z.array(z.string().trim().min(1).max(60)).max(30),
    opted_out: z.boolean(),
    created_at: z.string().trim().min(1).max(60),
  })
  .strict();
export type CrmContact = z.infer<typeof CrmContact>;

export const MAX_CSV_BYTES = 1_000_000;
export const MAX_CSV_ROWS = 1_000;

export interface CsvIssue {
  line: number;
  field: string;
  message: string;
}

export interface CsvImportRow {
  display_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  document_token: string | null;
  source: string | null;
  tags: string[];
}

export interface CsvImportResult {
  rows: CsvImportRow[];
  issues: CsvIssue[];
  skipped: number;
  limitReached: boolean;
}

const HEADERS: Record<string, keyof CsvImportRow | "tags"> = {
  nome: "display_name",
  name: "display_name",
  email: "email",
  correio: "email",
  telefone: "phone",
  celular: "phone",
  whatsapp: "phone",
  phone: "phone",
  empresa: "company",
  companhia: "company",
  company: "company",
  documento_token: "document_token",
  document_token: "document_token",
  origem: "source",
  fonte: "source",
  source: "source",
  tags: "tags",
  etiquetas: "tags",
};

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const headerKey = (s: string) =>
  stripAccents(s)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** UTF-8 byte count without Buffer (browser-safe); stops as soon as the limit is passed. */
function exceedsUtf8Bytes(text: string, max: number): boolean {
  let bytes = 0;
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (bytes > max) return true;
  }
  return false;
}

/** RFC-4180 style parser: quotes, doubled quotes, CRLF and BOM. Bounded. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validates an authorised contact import; never invents missing values. */
export function importContactsCsv(text: string): CsvImportResult {
  const issues: CsvIssue[] = [];
  const rows: CsvImportRow[] = [];
  if (exceedsUtf8Bytes(text, MAX_CSV_BYTES)) {
    return {
      rows: [],
      issues: [{ line: 0, field: "arquivo", message: "CSV acima do limite" }],
      skipped: 0,
      limitReached: true,
    };
  }
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!parsed.length)
    return {
      rows: [],
      issues: [{ line: 1, field: "cabeçalho", message: "CSV vazio" }],
      skipped: 0,
      limitReached: false,
    };
  const headers = (parsed[0] ?? []).map(headerKey);
  const mapped = headers.map((h) => HEADERS[h]);
  if (!mapped.includes("display_name")) {
    return {
      rows: [],
      issues: [{ line: 1, field: "cabeçalho", message: "coluna 'nome' ausente" }],
      skipped: 0,
      limitReached: false,
    };
  }
  let skipped = 0;
  let limitReached = false;
  for (let i = 1; i < parsed.length; i++) {
    if (rows.length >= MAX_CSV_ROWS) {
      limitReached = true;
      break;
    }
    const cells = parsed[i] ?? [];
    const line = i + 1;
    const get = (key: string) => {
      const idx = mapped.indexOf(key as keyof CsvImportRow);
      return idx < 0 ? "" : (cells[idx] ?? "").trim();
    };
    const display_name = get("display_name");
    const email = get("email") || null;
    const phone = get("phone") || null;
    const document_token = get("document_token") || null;
    const source = get("source") || null;
    const company = get("company") || null;
    const rawTags = get("tags");
    const tags = rawTags
      ? rawTags
          .split(/[|;]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10)
      : [];
    let invalid = false;
    if (!display_name) {
      issues.push({ line, field: "nome", message: "obrigatório" });
      invalid = true;
    } else if (Array.from(display_name).length > 160) {
      issues.push({ line, field: "nome", message: "longo demais" });
      invalid = true;
    }
    if (email && (!EMAIL.test(email) || email.length > 254)) {
      issues.push({ line, field: "email", message: "inválido" });
      invalid = true;
    }
    if (phone && !/^\+?[0-9 ()-]{8,20}$/.test(phone)) {
      issues.push({ line, field: "telefone", message: "inválido" });
      invalid = true;
    }
    if (document_token && !/^[A-Za-z0-9_-]{8,128}$/.test(document_token)) {
      issues.push({
        line,
        field: "documento_token",
        message: "inválido (use token, não documento em claro)",
      });
      invalid = true;
    }
    if (invalid) {
      skipped++;
      continue;
    }
    rows.push({ display_name, email, phone, company, document_token, source, tags });
  }
  return { rows, issues, skipped, limitReached };
}

// ---------------- Deduplication (suggestion only) ----------------

export type ContactLike = Pick<
  CrmContact,
  "id" | "display_name" | "emails" | "phones" | "document_token"
>;

export interface DuplicateGroup {
  key: string;
  reason: "email" | "telefone" | "documento_token";
  ids: string[];
}

const normEmail = (v: string) => v.trim().toLowerCase();
const normPhone = (v: string) => v.replace(/\D/g, "");
const normDoc = (v: string) => v.trim().toLowerCase();

/** Groups contacts by a single high-confidence key. Never merges records. */
export function detectDuplicates(contacts: readonly ContactLike[]): DuplicateGroup[] {
  const indexes: { reason: DuplicateGroup["reason"]; map: Map<string, Set<string>> }[] = [
    { reason: "email", map: new Map() },
    { reason: "telefone", map: new Map() },
    { reason: "documento_token", map: new Map() },
  ];
  for (const c of contacts) {
    const add = (reason: DuplicateGroup["reason"], key: string) => {
      if (!key) return;
      const set = indexes.find((i) => i.reason === reason)!.map;
      const ids = set.get(key) ?? new Set<string>();
      ids.add(c.id);
      set.set(key, ids);
    };
    for (const e of c.emails) add("email", normEmail(e));
    for (const p of c.phones) add("telefone", normPhone(p));
    if (c.document_token) add("documento_token", normDoc(c.document_token));
  }
  const groups: DuplicateGroup[] = [];
  for (const idx of indexes) {
    for (const [key, ids] of idx.map) {
      if (ids.size > 1) groups.push({ key, reason: idx.reason, ids: [...ids].sort() });
    }
  }
  return groups.sort((a, b) => a.reason.localeCompare(b.reason) || a.key.localeCompare(b.key));
}

export interface MergeField {
  field: string;
  primary: string | null;
  duplicate: string | null;
  conflict: boolean;
  resolution: string | null;
}

export interface MergePreview {
  primaryId: string;
  duplicateId: string;
  fields: MergeField[];
  requiresConfirmation: true;
  reason: string;
}

/** Preview only: the primary value wins and every conflict needs a human. */
export function previewMerge(primary: ContactLike, duplicate: ContactLike): MergePreview {
  const fields: MergeField[] = [];
  const pair = (field: string, a: string | null | undefined, b: string | null | undefined) => {
    const pa = a ?? null;
    const db = b ?? null;
    fields.push({
      field,
      primary: pa,
      duplicate: db,
      conflict: Boolean(pa && db && pa !== db),
      resolution: pa ?? db,
    });
  };
  pair("display_name", primary.display_name, duplicate.display_name);
  pair("emails", primary.emails.join("; ") || null, duplicate.emails.join("; ") || null);
  pair("phones", primary.phones.join("; ") || null, duplicate.phones.join("; ") || null);
  pair("document_token", primary.document_token, duplicate.document_token);
  return {
    primaryId: primary.id,
    duplicateId: duplicate.id,
    fields,
    requiresConfirmation: true,
    reason: "Unificação é somente preview: conflitos exigem confirmação humana e auditoria.",
  };
}

// ---------------- Segments ----------------

export interface SegmentRule {
  tagsAny?: readonly string[];
  tagsAll?: readonly string[];
  source?: string;
  onlyOptedIn?: boolean;
}

export function matchesSegment(contact: CrmContact, rule: SegmentRule): boolean {
  if (rule.onlyOptedIn && contact.opted_out) return false;
  if (rule.source && contact.source !== rule.source) return false;
  const tags = new Set(contact.tags);
  if (rule.tagsAny?.length && !rule.tagsAny.some((t) => tags.has(t))) return false;
  if (rule.tagsAll?.length && !rule.tagsAll.every((t) => tags.has(t))) return false;
  return true;
}
