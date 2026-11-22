import { pageHead } from "@/lib/core/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowUpRight, Calculator, FileText, Search, Tag, X } from "lucide-react";
import { runFunnel, runSales, writeSalesNarrative } from "@/lib/api/agents.functions";
import { trendsQuery } from "@/lib/queries";
import { renderPrintHtml } from "@/lib/core/print-report";
import { buildSalesReport } from "@/lib/core/sales-report";
import {
  buildNarrativeFacts,
  SalesNarrativeSchema,
  type SalesNarrative,
} from "@/lib/core/sales-narrative";
import { Outcome, Panel } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_app/vendas")({
  head: () =>
    pageHead(
      "Vendas e funil — CentralIA",
      "Vitrine demonstrativa e cálculos determinísticos de margem, preço, equilíbrio e funil.",
    ),
  component: Vendas,
});

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

type ShopAction = "product" | "margin" | "price" | "break_even" | "funnel" | "report" | "natural";
type Category = "Todos" | "Produtos" | "Cálculo" | "Funil" | "Relatório";
type Art = "grid" | "bars" | "stripes" | "rings" | "blocks" | "dots" | "wave";

const CATEGORIES: readonly Category[] = ["Todos", "Produtos", "Cálculo", "Funil", "Relatório"];

type ShopTile = {
  id: string;
  code: string;
  name: string;
  note: string;
  tag: string;
  tagDark?: boolean;
  art: Art;
  price: string;
  was?: string;
  priceNote: string;
  category: Category;
  span: "sm" | "md" | "lg";
  action: ShopAction;
  demo?: { product: string; cost: string; price: string };
};

// Illustrative catalogue only. These names, codes and prices are local demo data —
// no product, customer or commercial claim here is real.
const TILES: readonly ShopTile[] = [
  {
    id: "tool-margin",
    code: "SRV-001",
    name: "Margem por unidade",
    note: "Custo, preço e concorrência. Números finitos ou falha fechada.",
    tag: "núcleo",
    art: "bars",
    price: "R$ 0",
    priceNote: "sample · ferramenta real",
    category: "Cálculo",
    span: "md",
    action: "margin",
  },
  {
    id: "tool-price",
    code: "SRV-002",
    name: "Preço alvo",
    note: "Parte do custo e da margem desejada, sem inventar o resto.",
    tag: "núcleo",
    art: "grid",
    price: "R$ 0",
    priceNote: "sample · ferramenta real",
    category: "Cálculo",
    span: "md",
    action: "price",
  },
  {
    id: "tool-break-even",
    code: "SRV-003",
    name: "Ponto de equilíbrio",
    note: "Custos fixos e margem de contribuição até a unidade exata.",
    tag: "núcleo",
    art: "blocks",
    price: "R$ 0",
    priceNote: "sample · ferramenta real",
    category: "Cálculo",
    span: "md",
    action: "break_even",
  },
  {
    id: "p-caderno",
    code: "CD-014",
    name: "Caderno capa dura",
    note: "192 páginas · 90 g · amostra de papelaria",
    tag: "-28% sample",
    art: "grid",
    price: "R$ 34,90",
    was: "R$ 48,00",
    priceNote: "sample · preço ilustrativo",
    category: "Produtos",
    span: "sm",
    action: "product",
    demo: { product: "caderno capa dura", cost: "12", price: "34.90" },
  },
  {
    id: "p-caneta",
    code: "PE-208",
    name: "Caneta tinta gel",
    note: "0,5 mm · corpo fino · amostra de papelaria",
    tag: "novo",
    art: "bars",
    price: "R$ 12,00",
    priceNote: "sample · preço ilustrativo",
    category: "Produtos",
    span: "sm",
    action: "product",
    demo: { product: "caneta tinta gel", cost: "3.5", price: "12" },
  },
  {
    id: "p-camiseta",
    code: "CM-091",
    name: "Camiseta algodão",
    note: "Algodão penteado · tamanhos P a GG",
    tag: "topo",
    tagDark: true,
    art: "stripes",
    price: "R$ 89,00",
    priceNote: "sample · preço ilustrativo",
    category: "Produtos",
    span: "sm",
    action: "product",
    demo: { product: "camiseta algodao", cost: "28", price: "89" },
  },
  {
    id: "p-cafe",
    code: "CF-330",
    name: "Café em grãos 500g",
    note: "Torra média · embalagem lacrada",
    tag: "-15% sample",
    art: "rings",
    price: "R$ 49,00",
    was: "R$ 58,00",
    priceNote: "sample · preço ilustrativo",
    category: "Produtos",
    span: "sm",
    action: "product",
    demo: { product: "cafe em graos", cost: "19", price: "49" },
  },
  {
    id: "p-mochila",
    code: "MC-117",
    name: "Mochila de lona",
    note: "Lona encerada · compartimento para notebook",
    tag: "amostra",
    tagDark: true,
    art: "blocks",
    price: "R$ 189,00",
    priceNote: "sample · preço ilustrativo",
    category: "Produtos",
    span: "sm",
    action: "product",
    demo: { product: "mochila de lona", cost: "62", price: "189" },
  },
  {
    id: "p-bolso",
    code: "CD-022",
    name: "Caderno de bolso",
    note: "96 páginas · capa flexível · amostra",
    tag: "3 por 2",
    art: "dots",
    price: "R$ 21,00",
    priceNote: "sample · preço ilustrativo",
    category: "Produtos",
    span: "sm",
    action: "product",
    demo: { product: "caderno de bolso", cost: "7", price: "21" },
  },
  {
    id: "p-garrafa",
    code: "GF-045",
    name: "Garrafa térmica",
    note: "500 ml · aço inox · amostra",
    tag: "novo",
    art: "wave",
    price: "R$ 99,00",
    priceNote: "sample · preço ilustrativo",
    category: "Produtos",
    span: "sm",
    action: "product",
    demo: { product: "garrafa termica", cost: "35", price: "99" },
  },
  {
    id: "p-etiquetas",
    code: "ET-006",
    name: "Kit de etiquetas",
    note: "12 folhas adesivas · amostra",
    tag: "amostra",
    tagDark: true,
    art: "stripes",
    price: "R$ 29,00",
    priceNote: "sample · preço ilustrativo",
    category: "Produtos",
    span: "sm",
    action: "product",
    demo: { product: "kit de etiquetas", cost: "9", price: "29" },
  },
  {
    id: "tool-natural",
    code: "SRV-004",
    name: "Pedido em linguagem natural",
    note: "A IA interpreta; o cálculo continua determinístico.",
    tag: "entrada",
    art: "wave",
    price: "R$ 0",
    priceNote: "sample · ferramenta real",
    category: "Cálculo",
    span: "lg",
    action: "natural",
  },
  {
    id: "tool-funnel",
    code: "SRV-005",
    name: "Diagnóstico de funil",
    note: "Visitantes, checkouts, vendas e ofertas — relatorios são dados não confiáveis.",
    tag: "análise",
    art: "bars",
    price: "R$ 0",
    priceNote: "sample · ferramenta real",
    category: "Funil",
    span: "lg",
    action: "funnel",
  },
  {
    id: "tool-report",
    code: "SRV-006",
    name: "Relatório para impressão",
    note: "Resultados desta sessão e tendências já salvas, sem coleta.",
    tag: "saída",
    tagDark: true,
    art: "grid",
    price: "R$ 0",
    priceNote: "sample · ferramenta real",
    category: "Relatório",
    span: "lg",
    action: "report",
  },
];

function Vendas() {
  const qc = useQueryClient();
  const sales = useServerFn(runSales);
  const funnel = useServerFn(runFunnel);
  const writeNarrative = useServerFn(writeSalesNarrative);
  const [action, setAction] = useState<"margin" | "price" | "break_even">("margin");
  const [f, setF] = useState({
    product: "produto",
    unit_cost: "12",
    price: "30",
    target_margin_pct: "40",
    fixed_costs: "1000",
    competitors: "",
  });
  const [salesText, setSalesText] = useState("");
  const [funnelText, setFunnelText] = useState("");
  const [pdfBusy, setPdfBusy] = useState<"plain" | "ai" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("Todos");
  const [selected, setSelected] = useState<string | null>(null);
  const s = useMutation({
    mutationFn: (d: Parameters<typeof sales>[0]["data"]) => sales({ data: d }),
  });
  const fu = useMutation({ mutationFn: (t: string) => funnel({ data: { text: t } }) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const request = () => ({
    action,
    product: f.product,
    unit_cost: num(f.unit_cost),
    price: action === "price" ? null : num(f.price),
    target_margin_pct: action === "price" ? num(f.target_margin_pct) : null,
    fixed_costs: action === "break_even" ? num(f.fixed_costs) : null,
    competitor_prices: f.competitors
      .split(/[\s;]+/)
      .filter(Boolean)
      .map((x) => Number(x.replace(",", "."))),
  });

  const printReport = async (mode: "plain" | "ai") => {
    setPdfBusy(mode);
    setPdfError(null);
    // Open synchronously with the click so popup blockers keep the user gesture.
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      setPdfError("Pop-up bloqueado. Libere pop-ups para este site e tente novamente.");
      setPdfBusy(null);
      return;
    }
    try {
      const trends = await qc.fetchQuery(trendsQuery("latest", 24));
      const input = {
        generatedAt: new Date().toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }),
        sales: s.data ?? null,
        funnel: fu.data ?? null,
        salesParams: request(),
        trendRows: trends.rows,
        trendObservationCount: trends.observations.length,
      };

      let narrative: SalesNarrative | null = null;
      let narrativeError: string | null = null;
      if (mode === "ai") {
        try {
          const facts = buildNarrativeFacts({
            ...input,
            sampleTiles: TILES,
          });
          const r = await writeNarrative({ data: facts });
          if (r.ok && r.data) {
            const parsed = SalesNarrativeSchema.safeParse(r.data);
            if (parsed.success) narrative = parsed.data;
            else narrativeError = "A IA respondeu fora do formato; o PDF segue determinístico.";
          } else {
            narrativeError = r.reasons?.[0] ?? "Resposta da IA indisponível.";
          }
        } catch {
          narrativeError = "A IA não pôde ser consultada; o PDF segue determinístico.";
        }
      }

      const html = renderPrintHtml(
        buildSalesReport({
          ...input,
          ...(mode === "ai" ? { narrative, narrativeError } : {}),
        }),
      );
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try {
          win.print();
        } catch {
          setPdfError("Não foi possível abrir a impressão. Use o menu Imprimir da janela aberta.");
        }
      }, 200);
    } catch (e) {
      win.close();
      setPdfError((e as Error).message || "Não foi possível abrir a impressão.");
    } finally {
      setPdfBusy(null);
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activate = (tile: ShopTile) => {
    setSelected(tile.id);
    switch (tile.action) {
      case "product": {
        if (!tile.demo) return;
        setAction("margin");
        setF((prev) => ({
          ...prev,
          product: tile.demo!.product,
          unit_cost: tile.demo!.cost,
          price: tile.demo!.price,
        }));
        scrollTo("sf-calculo");
        break;
      }
      case "margin":
      case "price":
      case "break_even":
        setAction(tile.action);
        scrollTo("sf-calculo");
        break;
      case "natural":
        scrollTo("sf-natural");
        window.setTimeout(() => document.getElementById("sf-natural-input")?.focus(), 280);
        break;
      case "funnel":
        scrollTo("sf-funil");
        break;
      case "report":
        if (s.data || fu.data) void printReport("plain");
        else scrollTo("sf-relatorio");
        break;
    }
  };

  const submit = () => s.mutate({ request: request() });

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return TILES.filter((tile) => {
      if (category !== "Todos" && tile.category !== category) return false;
      if (!q) return true;
      return `${tile.name} ${tile.code} ${tile.note} ${tile.tag} ${tile.category}`
        .toLocaleLowerCase("pt-BR")
        .includes(q);
    });
  }, [category, query]);

  return (
    <div className="shopfront -mx-5 -mb-8 -mt-8 min-h-[calc(100vh-3rem)] md:-mx-8">
      <header className="sf-masthead">
        <div className="sf-wrap sf-masthead-inner">
          <div className="sf-brand">
            <span className="sf-brand-mark" aria-hidden>
              B
            </span>
            <div>
              <div className="sf-brand-name">
                Balcão<span>.</span>
              </div>
              <div className="sf-brand-sub">vitrine de vendas · CentralIA</div>
            </div>
          </div>
          <div className="sf-masthead-meta">
            <span className="sf-demo-chip">● amostra — sem produtos reais</span>
            <span className="sf-meta-line">sessão local · nada é publicado</span>
          </div>
        </div>
      </header>

      <div className="sf-ticker" aria-hidden="true">
        <div className="sf-wrap sf-ticker-inner">
          <span>vitrine demonstrativa</span>
          <span>preços ilustrativos</span>
          <span>cálculos reais no balcão</span>
          <span>sem estoque · sem checkout</span>
        </div>
      </div>

      <div className="sf-wrap sf-sample-banner" role="region" aria-label="Aviso de amostra">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <span className="sf-sample-mark">●</span>
          <span className="sf-sample-text font-medium">AMOSTRA</span>
          <span className="sf-sample-text">
            — este balcão exibe dados ilustrativos. Nenhum produto, preço ou cliente aqui é real. Os
            cálculos de margem, preço e equilíbrio usam contratos determinísticos, mas não geram pedidos
            nem publicam nada.
          </span>
        </div>
      </div>

      <div className="sf-wrap sf-toolbar">
        <form
          className="sf-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            scrollTo("sf-vitrine");
          }}
        >
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto, código ou função…"
            aria-label="Buscar na vitrine"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca">
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </form>
        <div className="sf-cats" role="group" aria-label="Categorias da vitrine">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className="sf-cat"
              aria-pressed={category === cat}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <section className="sf-wrap sf-lead" aria-label="Vitrine e balcão de cálculo">
        <div className="sf-lead-copy">
          <h1 className="sf-lead-title">O preço é de amostra. O cálculo é real.</h1>
          <p>
            Escolha um item da prateleira ou abra o balcão: margem, preço e equilíbrio usam os
            contratos determinísticos da CentralIA.
          </p>
        </div>
        <div className="sf-lead-desk">
          <span className="sf-sample-tag">sample</span>
          <div className="sf-lead-figure">
            <span>R$ 34,90</span>
            <small>caderno capa dura · amostra</small>
          </div>
          <a
            href="#sf-calculo"
            className="sf-lead-cta"
            onClick={() => {
              setAction("margin");
              setSelected("tool-margin");
            }}
          >
            Calcular margem <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </section>

      <main className="sf-wrap sf-main" id="sf-vitrine">
        <div className="sf-section-head">
          <h2 className="sf-title">Prateleira de demonstração</h2>
          <span className="sf-count" aria-live="polite">
            {String(visible.length).padStart(2, "0")} itens · amostra local
          </span>
        </div>

        <div className="sf-grid">
          {visible.map((tile) => (
            <article
              key={tile.id}
              className={`sf-tile sf-tile--${tile.span} sf-tile--${tile.category === "Produtos" ? "product" : "tool"}${selected === tile.id ? " sf-tile--active" : ""}`}
            >
              <div className="sf-tile-top">
                <span className="sf-code">{tile.code}</span>
                <span className={`sf-tag${tile.tagDark ? " sf-tag--dark" : ""}`}>{tile.tag}</span>
              </div>
              <div className={`sf-art sf-art--${tile.art}`} aria-hidden="true" />
              <h2 className="sf-name">{tile.name}</h2>
              <p className="sf-note">{tile.note}</p>
              <div className="sf-price-row">
                <div>
                  <span className="sf-price">
                    {tile.was ? <s>{tile.was}</s> : null}
                    {tile.price}
                  </span>
                  <small>{tile.priceNote}</small>
                </div>
                <button
                  type="button"
                  className="sf-go"
                  onClick={() => activate(tile)}
                  aria-label={`Abrir ${tile.name}`}
                >
                  {tile.category === "Produtos" ? (
                    <Tag size={13} aria-hidden="true" />
                  ) : (
                    <Calculator size={13} aria-hidden="true" />
                  )}
                  abrir <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="sf-empty">
            <span className="sf-empty-mark" aria-hidden>
              [ ]
            </span>
            <strong>Nada nesta prateleira.</strong>
            <p>A vitrine é demonstrativa. Tente outro termo ou volte para “Todos”.</p>
            <button
              type="button"
              className="sf-reset"
              onClick={() => {
                setQuery("");
                setCategory("Todos");
              }}
            >
              Limpar filtros
            </button>
          </div>
        ) : null}

        <p className="sf-disclaimer">
          <span className="font-bold text-amber-800">Amostra:</span> nomes, códigos, preços e descontos
          acima são dados locais criados só para demonstrar a interface. Clicar em um item carrega seus
          números no balcão abaixo; nenhum pedido é criado, nenhum pagamento é iniciado e nada é publicado.
        </p>
      </main>

      <section className="sf-backroom" id="sf-balcao" aria-labelledby="sf-backroom-title">
        <div className="sf-wrap sf-backroom-inner">
          <div className="sf-backroom-head">
            <div>
              <h2 id="sf-backroom-title">O motor por trás da vitrine</h2>
              <p>
                Aqui os números são reais: margem, preço, equilíbrio e funil passam pelos gates
                determinísticos. Campos ausentes falham fechado — nada é inventado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pdfBusy !== null || (!s.data && !fu.data)}
                onClick={() => void printReport("plain")}
              >
                <FileText size={14} aria-hidden="true" />
                {pdfBusy === "plain" ? "Abrindo…" : "Imprimir PDF"}
              </Button>
              <Button
                variant="signal"
                disabled={pdfBusy !== null || (!s.data && !fu.data)}
                onClick={() => void printReport("ai")}
              >
                <FileText size={14} aria-hidden="true" />
                {pdfBusy === "ai" ? "Gerando com IA…" : "Gerar PDF com IA"}
              </Button>
            </div>
          </div>

          <div className="sf-backroom-grid">
            <div id="sf-calculo" className="min-w-0">
              <Panel title="vendas" className="min-w-0">
                <div className="mb-4 flex gap-1">
                  {(["margin", "price", "break_even"] as const).map((a) => (
                    <Button
                      key={a}
                      size="sm"
                      variant={action === a ? "signal" : "outline"}
                      onClick={() => setAction(a)}
                    >
                      {a === "margin" ? "margem" : a === "price" ? "preço" : "equilíbrio"}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Produto" value={f.product} onChange={set("product")} />
                  <Field label="Custo unitário" value={f.unit_cost} onChange={set("unit_cost")} />
                  {action !== "price" ? (
                    <Field label="Preço" value={f.price} onChange={set("price")} />
                  ) : (
                    <Field
                      label="Margem-alvo (%)"
                      value={f.target_margin_pct}
                      onChange={set("target_margin_pct")}
                    />
                  )}
                  {action === "break_even" ? (
                    <Field
                      label="Custos fixos"
                      value={f.fixed_costs}
                      onChange={set("fixed_costs")}
                    />
                  ) : null}
                  <Field
                    label="Concorrentes (opcional)"
                    value={f.competitors}
                    onChange={set("competitors")}
                    placeholder="25 29 35"
                  />
                </div>
                <Button className="mt-4" variant="signal" onClick={submit} disabled={s.isPending}>
                  {s.isPending
                    ? "Calculando…"
                    : action === "margin"
                      ? "Calcular margem"
                      : action === "price"
                        ? "Calcular preço"
                        : "Calcular equilíbrio"}
                </Button>
                <div className="mt-5 border-t border-border pt-4" id="sf-natural">
                  <Label htmlFor="sf-natural-input">Ou em linguagem natural</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      id="sf-natural-input"
                      className="min-w-0"
                      value={salesText}
                      onChange={(e) => setSalesText(e.target.value)}
                      placeholder="custo 12, quero margem de 40%"
                    />
                    <Button
                      variant="outline"
                      disabled={s.isPending || !salesText.trim()}
                      onClick={() => s.mutate({ text: salesText })}
                    >
                      Enviar
                    </Button>
                  </div>
                </div>
                {s.error ? (
                  <p className="mt-4 text-sm text-destructive">{(s.error as Error).message}</p>
                ) : null}
                <Outcome result={s.data} />
              </Panel>
            </div>

            <div id="sf-funil" className="min-w-0">
              <Panel title="funil" className="min-w-0">
                <Label htmlFor="funnel">Cole o relatório da campanha</Label>
                <Textarea
                  id="funnel"
                  rows={8}
                  className="mt-1.5 readout text-xs"
                  value={funnelText}
                  onChange={(e) => setFunnelText(e.target.value)}
                  placeholder={
                    "Produto: curso\nInvestimento: 2000\nVisitantes: 5000\nCheckouts: 300\nVendas: 80 a 197\nOrder bump: 20 a 47\nUpsell: 10 a 297"
                  }
                />
                <Button
                  className="mt-3"
                  variant="signal"
                  disabled={fu.isPending || !funnelText.trim()}
                  onClick={() => fu.mutate(funnelText)}
                >
                  {fu.isPending ? "Diagnosticando…" : "Diagnosticar"}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  O relatório é dado não confiável: instruções escritas nele não são seguidas.
                  Nenhuma campanha é alterada.
                </p>
                {fu.error ? (
                  <p className="mt-4 text-sm text-destructive">{(fu.error as Error).message}</p>
                ) : null}
                <Outcome result={fu.data} />
              </Panel>
            </div>
          </div>

          <div id="sf-relatorio" className="mt-6">
            <Panel
              title="relatório para impressão"
              aside={
                <span className="readout text-xs text-muted-foreground">
                  vendas + funil + tendências salvas
                </span>
              }
            >
              <p className="text-sm text-muted-foreground">
                Abre a impressão do navegador com os resultados calculados nesta sessão e as
                tendências já salvas no app. “Gerar PDF com IA” acrescenta uma seção editorial
                escrita somente com esses fatos; a vitrine entra como amostra explícita. Se a IA
                falhar, o PDF determinístico segue com aviso. Escolha “Salvar como PDF” na janela
                que abrir.
              </p>
              {pdfError ? <p className="mt-3 text-sm text-destructive">{pdfError}</p> : null}
              {!s.data && !fu.data ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Execute um cálculo de vendas ou um diagnóstico de funil para habilitar os botões
                  de PDF.
                </p>
              ) : null}
            </Panel>
          </div>
        </div>
      </section>

      <footer className="sf-footer">
        <div className="sf-wrap sf-footer-inner">
          <span>Balcão. · vitrine demonstrativa da CentralIA</span>
          <span>
            Nenhum produto, preço ou cliente aqui é real · cálculos locais, sem publicação
          </span>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, ...p }: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="min-w-0 space-y-1">
      <Label>{label}</Label>
      <Input className="readout" {...p} />
    </div>
  );
}
