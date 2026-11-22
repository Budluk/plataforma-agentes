import { describe, it, expect } from "vitest";
import {
  CrmContact,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  detectDuplicates,
  importContactsCsv,
  matchesSegment,
  parseCsv,
  previewMerge,
  type ContactLike,
} from "@/lib/core/crm";

const contact = (overrides: Partial<CrmContact> = {}): CrmContact =>
  CrmContact.parse({
    id: "c1",
    organization_id: "org1",
    display_name: "Ana",
    emails: [],
    phones: [],
    opted_out: false,
    created_at: "2026-11-21T12:00:00Z",
    tags: [],
    ...overrides,
  });

const like = (
  id: string,
  emails: string[] = [],
  phones: string[] = [],
  document_token: string | null = null,
  display_name = "Ana",
): ContactLike => ({ id, display_name, emails, phones, document_token });

describe("CRM contact contract", () => {
  it("applies safe defaults and rejects unknown fields", () => {
    const c = contact();
    expect(c.document_token).toBeNull();
    expect(c.company_id).toBeNull();
    expect(c.source).toBeNull();
    expect(CrmContact.safeParse({ ...c, campo_extras: 1 }).success).toBe(false);
    expect(CrmContact.safeParse({ ...c, organization_id: "" }).success).toBe(false);
  });
});

describe("CSV import", () => {
  it("parses quotes, doubled quotes, CRLF and does not invent a trailing row", () => {
    expect(parseCsv('nome,email\r\n"Silva, João","a""b@example.com"\r\n')).toEqual([
      ["nome", "email"],
      ["Silva, João", 'a"b@example.com'],
    ]);
    expect(parseCsv("nome\nJoao\n")).toEqual([["nome"], ["Joao"]]);
  });

  it("accepts accented headers, BOM and splits tags without inventing values", () => {
    const csv =
      "\uFEFFnômê,email,celular,empresa,etiquetas\r\nMaria,maria@example.com,(11) 99999-9999,Acme,vip|lead\r\n";
    const r = importContactsCsv(csv);
    expect(r.issues).toEqual([]);
    expect(r.skipped).toBe(0);
    expect(r.rows).toEqual([
      {
        display_name: "Maria",
        email: "maria@example.com",
        phone: "(11) 99999-9999",
        company: "Acme",
        document_token: null,
        source: null,
        tags: ["vip", "lead"],
      },
    ]);
  });

  it("skips invalid rows and reports the offending field and line", () => {
    const csv =
      "nome,email,telefone,documento_token\n" +
      ",foo,bad,abc\n" +
      "Joao,foo@bar.com,11999999999,123.456.789-00\n";
    const r = importContactsCsv(csv);
    expect(r.rows).toEqual([]);
    expect(r.skipped).toBe(2);
    expect(r.issues.map((i) => i.field)).toEqual([
      "nome",
      "email",
      "telefone",
      "documento_token",
      "documento_token",
    ]);
    expect(r.issues[0]?.line).toBe(2);
    expect(r.issues[4]?.message).toContain("não documento em claro");
  });

  it("refuses files without a name column and empty files", () => {
    expect(importContactsCsv("email\nfoo@bar.com\n").issues[0]?.field).toBe("cabeçalho");
    expect(importContactsCsv("").issues[0]?.message).toBe("CSV vazio");
  });

  it("bounds rows and UTF-8 bytes without relying on Buffer", () => {
    const many = "nome\n" + Array.from({ length: MAX_CSV_ROWS + 2 }, (_, i) => `P${i}\n`).join("");
    const rows = importContactsCsv(many);
    expect(rows.rows).toHaveLength(MAX_CSV_ROWS);
    expect(rows.limitReached).toBe(true);

    const huge = importContactsCsv("x".repeat(MAX_CSV_BYTES + 1));
    expect(huge.limitReached).toBe(true);
    expect(huge.issues[0]?.line).toBe(0);

    // Four-byte characters must count as four bytes, not one code unit.
    expect(importContactsCsv("😀".repeat(250_001)).limitReached).toBe(true);
  });
});

describe("deduplication is a suggestion only", () => {
  it("groups contacts by normalized email, phone and document token", () => {
    const groups = detectDuplicates([
      like("a", ["Ana@Exemplo.com"], ["(11) 99999-9999"], "tok_abc123"),
      like("b", ["ana@exemplo.com"], [], "TOK_ABC123"),
      like("c", [], ["11999999999"]),
    ]);
    expect(groups.map((g) => `${g.reason}:${g.ids.join(",")}`)).toEqual([
      "documento_token:a,b",
      "email:a,b",
      "telefone:a,c",
    ]);
  });

  it("returns no group for distinct contacts", () => {
    expect(detectDuplicates([like("a", ["a@x.com"]), like("b", ["b@x.com"])])).toEqual([]);
  });
});

describe("merge preview", () => {
  it("marks conflicts, keeps the primary value and always requires confirmation", () => {
    const preview = previewMerge(
      like("a", ["a@x.com"], [], "tok_a", "Ana"),
      like("b", ["a@x.com"], ["(11) 1234-5678"], "tok_b", "Ana Maria"),
    );
    expect(preview.fields.map((f) => f.field)).toEqual([
      "display_name",
      "emails",
      "phones",
      "document_token",
    ]);
    expect(preview.fields.map((f) => f.conflict)).toEqual([true, false, false, true]);
    expect(preview.fields[0]?.resolution).toBe("Ana");
    expect(preview.fields[2]?.resolution).toBe("(11) 1234-5678");
    expect(preview.requiresConfirmation).toBe(true);
  });
});

describe("segments", () => {
  it("combines tag, source and opt-in rules", () => {
    const c = contact({ tags: ["vip", "lead"], source: "site" });
    expect(
      matchesSegment(c, {
        tagsAny: ["vip"],
        tagsAll: ["vip", "lead"],
        source: "site",
        onlyOptedIn: true,
      }),
    ).toBe(true);
    expect(matchesSegment(c, { tagsAny: ["outro"] })).toBe(false);
    expect(matchesSegment(c, { tagsAll: ["vip", "outro"] })).toBe(false);
    expect(matchesSegment(c, { source: "parceiro" })).toBe(false);
  });

  it("excludes opted-out contacts only when the rule requires opt-in", () => {
    const optedOut = contact({ opted_out: true, tags: ["vip"] });
    expect(matchesSegment(optedOut, { onlyOptedIn: true })).toBe(false);
    expect(matchesSegment(optedOut, {})).toBe(true);
  });
});
