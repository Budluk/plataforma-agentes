import { describe, expect, it } from "vitest";
import { checkStudioRequest, parseStudioText, StudioRequest } from "@/lib/core/studio";
import { isPrivateAddress } from "@/lib/core/studioNet";
import { assertDnsSafeHost, parseBaseUrl, studioAuthHeaders } from "@/lib/server/studio.server";
import { studioActionTool } from "@/lib/core/toolRegistry";
import { ToolMonitor } from "@/lib/core/toolMonitor";
import { toGuitarTab } from "@/lib/core/music";
import {
  checkFunnelRequest,
  checkSalesRequest,
  FunnelRequest,
  SalesRequest,
} from "@/lib/core/sales";

const ID = "3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const gate = (req: Record<string, unknown>) => checkStudioRequest(StudioRequest.parse(req));

describe("studio gate (closed actions, fail closed)", () => {
  it("requires a description to create, and refuses a URL inside it", () => {
    expect(gate({ action: "create" })).toContain("descrição ausente (falha fechada)");
    expect(gate({ action: "create", prompt: "crie um app https://exemplo.com/x" })).toContain(
      "descrição não pode conter URL; use a importação para sites e repositórios",
    );
    expect(gate({ action: "create", prompt: "criar um app de agenda de consultas" })).toEqual([]);
  });
  it("requires project_id for status and accepts nothing else", () => {
    expect(gate({ action: "status" })).toContain("project_id ausente (falha fechada)");
    expect(gate({ action: "status", project_id: ID, prompt: "um texto qualquer" })).toContain(
      "status não aceita outros parâmetros",
    );
    expect(gate({ action: "status", project_id: ID })).toEqual([]);
  });
  it("requires a version to restore and rejects version anywhere else", () => {
    expect(gate({ action: "restore", project_id: ID })).toContain(
      "restauração exige o número da versão (falha fechada)",
    );
    expect(
      gate({ action: "create", prompt: "criar um app de agenda de consultas", version: 2 }),
    ).toContain("create não aceita version");
    expect(gate({ action: "restore", project_id: ID, version: 3 })).toEqual([]);
  });
  it("accepts inspiration only from public social hosts, never from local or private addresses", () => {
    expect(gate({ action: "inspiration", url: "https://www.instagram.com/perfil" })).toEqual([]);
    expect(gate({ action: "inspiration", url: "https://exemplo.com/pagina" })).toContain(
      "análise de inspiração aceita apenas YouTube, TikTok, Instagram ou Facebook",
    );
    expect(gate({ action: "inspiration", url: "http://127.0.0.1:8000/perfil" })).toContain(
      "URL local ou privada não é permitida",
    );
    expect(gate({ action: "inspiration", url: "http://192.168.0.1/pagina" })).toContain(
      "URL local ou privada não é permitida",
    );
    expect(gate({ action: "inspiration", url: "http://user:pass@8.8.8.8/pagina" })).toContain(
      "URL não pode conter usuário/senha",
    );
  });
  it("imports repositories only from github.com", () => {
    expect(
      gate({ action: "import", kind: "github", url: "https://gitlab.com/algum/repo" }),
    ).toContain("importação de repositório aceita apenas github.com");
    expect(
      gate({ action: "import", kind: "github", url: "https://github.com/algum/repo" }),
    ).toEqual([]);
  });
  it("takes no parameters on health and needs a message on messages", () => {
    expect(gate({ action: "health", prompt: "um texto qualquer" })).toContain(
      "health não aceita parâmetros",
    );
    expect(gate({ action: "messages", project_id: ID })).toContain(
      "mensagem ausente (falha fechada)",
    );
  });
});

describe("studio free-text router", () => {
  it("maps plain words to single actions", () => {
    expect(parseStudioText("criar um app de agenda de consultas")).toMatchObject({
      ok: true,
      call: { action: "create" },
    });
    expect(parseStudioText("listar")).toMatchObject({ ok: true, call: { action: "list" } });
    expect(parseStudioText("health")).toMatchObject({ ok: true, call: { action: "health" } });
    expect(parseStudioText("banana")).toMatchObject({ ok: false });
  });
  it("reads the project id and the intended action from one sentence", () => {
    expect(parseStudioText(`validar ${ID}`)).toMatchObject({
      ok: true,
      call: { action: "validate", project_id: ID },
    });
    expect(parseStudioText(`restaurar a versão 3 no app ${ID}`)).toMatchObject({
      ok: true,
      call: { action: "restore", version: 3 },
    });
    expect(parseStudioText(`mensagem ${ID}: mudar a cor do botão`)).toMatchObject({
      ok: true,
      call: { action: "messages", project_id: ID, message: "mudar a cor do botão" },
    });
  });
  it("sees a social link as inspiration and a github link as an import", () => {
    expect(parseStudioText("analisar o canal https://www.youtube.com/@canal")).toMatchObject({
      ok: true,
      call: { action: "inspiration", url: "https://www.youtube.com/@canal" },
    });
    expect(parseStudioText("importar https://github.com/algum/repo")).toMatchObject({
      ok: true,
      call: { action: "import", kind: "github" },
    });
  });
});

describe("studio service address", () => {
  const TUNNEL = "abc123.trycloudflare.com";
  it("accepts the local service over http, including the bracketed IPv6 spelling", () => {
    expect(parseBaseUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(parseBaseUrl("http://localhost:8787/")).toBe("http://localhost:8787");
    expect(parseBaseUrl("http://[::1]:8787")).toBe("http://[::1]:8787");
  });
  it("accepts a remote address only over https and only when its host was allowed", () => {
    expect(parseBaseUrl(`https://${TUNNEL}`, [TUNNEL])).toBe(`https://${TUNNEL}`);
    expect(() => parseBaseUrl(`https://${TUNNEL}`)).toThrow(/não está na lista/);
    expect(() => parseBaseUrl(`http://${TUNNEL}`, [TUNNEL])).toThrow(/só é aceito com https/);
  });
  it("refuses credentials, paths and queries in the address", () => {
    expect(() => parseBaseUrl(`https://user:pass@${TUNNEL}`, [TUNNEL])).toThrow(/credenciais/);
    expect(() => parseBaseUrl(`https://${TUNNEL}/api`, [TUNNEL])).toThrow(/caminho/);
    expect(() => parseBaseUrl(`https://${TUNNEL}?x=1`, [TUNNEL])).toThrow(/query/);
  });
  it("sends the Bearer token only for the exact configured host", () => {
    const previousToken = process.env["STUDIO_API_TOKEN"];
    const previousHost = process.env["STUDIO_TOKEN_HOST"];
    try {
      delete process.env["STUDIO_API_TOKEN"];
      delete process.env["STUDIO_TOKEN_HOST"];
      expect(studioAuthHeaders("tunnel.example.com")).toEqual({});

      process.env["STUDIO_API_TOKEN"] = " token-from-secret ";
      expect(studioAuthHeaders("tunnel.example.com")).toEqual({}); // no host binding: fail closed

      process.env["STUDIO_TOKEN_HOST"] = "other.example.com";
      expect(studioAuthHeaders("tunnel.example.com")).toEqual({});

      process.env["STUDIO_TOKEN_HOST"] = "TUNNEL.example.com";
      expect(studioAuthHeaders("tunnel.example.com")).toEqual({
        Authorization: "Bearer token-from-secret",
      });
    } finally {
      if (previousToken === undefined) delete process.env["STUDIO_API_TOKEN"];
      else process.env["STUDIO_API_TOKEN"] = previousToken;
      if (previousHost === undefined) delete process.env["STUDIO_TOKEN_HOST"];
      else process.env["STUDIO_TOKEN_HOST"] = previousHost;
    }
  });
});

describe("studio DNS guard", () => {
  it("classifies private, reserved and IPv4-mapped addresses as private", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.1.1",
      "169.254.1.1",
      "0.0.0.0",
      "172.16.0.1",
      "100.64.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:192.168.1.1",
      "",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("classifies public literals as public", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
  it("allows loopback without any DNS lookup", async () => {
    await expect(assertDnsSafeHost("127.0.0.1")).resolves.toBeUndefined();
    await expect(assertDnsSafeHost("::1")).resolves.toBeUndefined();
  });
});

describe("studio tool registry wiring", () => {
  it("resolves each closed action to exactly one tool name", () => {
    expect(studioActionTool("health")).toBe("studio_health");
    expect(studioActionTool("import", "github")).toBe("studio_import_github");
    expect(studioActionTool("import", "app")).toBe("studio_import_app");
    expect(studioActionTool("inspiration_create")).toBe("studio_create_inspiration");
    expect(studioActionTool("restore")).toBe("studio_restore_version");
    expect(studioActionTool("nope")).toBe("");
  });
  it("blocks any studio action that did not probe the service first", () => {
    const monitor = new ToolMonitor();
    expect(
      monitor.check({ agent: "studio_agent", tool: "studio_list_apps", params: {} }, []).allowed,
    ).toBe(false);
    expect(
      monitor.check({ agent: "studio_agent", tool: "studio_list_apps", params: {} }, []).reason,
    ).toContain("studio_health");
    expect(
      monitor.check({ agent: "studio_agent", tool: "studio_health", params: {} }, []).allowed,
    ).toBe(true);
    expect(
      monitor.check({ agent: "studio_agent", tool: "studio_list_apps", params: {} }, [
        "studio_health",
      ]).allowed,
    ).toBe(true);
  });
  it("validates only path-like parameters, not free text", () => {
    const monitor = new ToolMonitor();
    expect(
      monitor.check(
        { agent: "dev_agent", tool: "save_code_file", params: { filename: "../../etc/passwd" } },
        [],
      ).allowed,
    ).toBe(false);
    expect(
      monitor.check(
        { agent: "dev_agent", tool: "save_code_file", params: { filename: "app.py" } },
        [],
      ).allowed,
    ).toBe(true);
    expect(
      monitor.check(
        {
          agent: "analyst",
          tool: "write_research_note",
          params: { asset: "PETR4", text: "nota com ../x e texto livre" },
        },
        [],
      ).allowed,
    ).toBe(true);
  });
});

describe("music tablature on distinct strings", () => {
  it("places the three notes of C on three different strings without a wide stretch", () => {
    const tab = toGuitarTab([60, 64, 67]);
    expect(tab).toHaveLength(3);
    expect(new Set(tab.map((t) => t.string)).size).toBe(3);
    const frets = tab.map((t) => t.fret);
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
  });
  it("refuses a chord with more notes than strings", () => {
    expect(() => toGuitarTab([60, 62, 64, 65, 67, 69, 71])).toThrow();
  });
});

describe("sales and funnel identity", () => {
  it("keeps the product name on one line", () => {
    const base = {
      action: "margin",
      unit_cost: 12,
      price: 20,
      target_margin_pct: null,
      fixed_costs: null,
      competitor_prices: [],
    };
    expect(
      checkSalesRequest(SalesRequest.parse({ ...base, product: "camiseta listrada" })),
    ).toEqual([]);
    expect(
      checkSalesRequest(SalesRequest.parse({ ...base, product: "camiseta\nlistrada" })),
    ).toContain("nome do produto contém caracteres não permitidos");
  });
  it("rejects a target margin of 95% or more at the contract", () => {
    expect(
      SalesRequest.safeParse({
        action: "price",
        product: "camiseta",
        unit_cost: 12,
        target_margin_pct: 96,
      }).success,
    ).toBe(false);
    expect(
      SalesRequest.safeParse({
        action: "price",
        product: "camiseta",
        unit_cost: 12,
        target_margin_pct: 40,
      }).success,
    ).toBe(true);
  });
  it("keeps the funnel product name on one line", () => {
    const base = {
      ad_spend: 1000,
      visitors: 1000,
      checkouts_started: 100,
      front_sales: 10,
      front_price: 97,
      platform_fee_pct: 10,
      tax_pct: 5,
    };
    expect(checkFunnelRequest(FunnelRequest.parse({ ...base, product: "curso online" }))).toEqual(
      [],
    );
    expect(
      checkFunnelRequest(FunnelRequest.parse({ ...base, product: "curso\nonline" })),
    ).toContain("nome do produto contém caracteres não permitidos");
  });
});
