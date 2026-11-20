# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One primary user: the operator/admin of CentralIA, signed in with the first account. They run and monitor agents across six areas, inspect results and audit history, review approvals, adjust runtime settings, and control the kill switch. Secondary audience: signed-out visitors who see the public landing and the published site page.

## Product Purpose

CentralIA is a multi-agent web control panel migrated from a Python CLI. It routes natural-language requests to closed agent areas, returns deterministic calculations, and keeps a human in the loop for irreversible actions. Success means the operator can run and verify automation quickly, with a clear record of what happened and why a request was refused.

## Positioning

Six agent areas (economy, music, sales, research, development and the central router) behind one operator console. Contracts and gates are deterministic; the LLM only interprets the request. Irreversible actions wait for a typed SIM, parameters are bound by hash, and the append-only audit is chained. The operator-facing interface must make speed and automation evident without hiding those controls.

## Operating Context

- Operator works in Portuguese (pt-BR). All interface copy, statuses and reasons are in Portuguese.
- The console is used at desktop and phone widths; earlier work explicitly verified phone-width forms and layouts.
- Areas are reached from a left navigation in the authenticated shell: Central, Economia, Música, Vendas e funil, Pesquisa, Desenvolvimento, Studio, Tendências, Conteúdo, Publicações, Aprovações, Agentes, Configurações, Histórico.
- A public landing explains the safety rules and sends visitors to sign-in or the panel; a signed-out `/site` page shows published content.
- Runtime settings, per-agent prompts and secrets are operator-only; provider can switch between Groq and Lovable AI without code changes.
- Reports are generated in the browser for printing/saving as PDF, using session results and trend observations already saved in the app; no live RSS collection happens during generation.

## Capabilities and Constraints

- Pure agent logic lives in `src/lib/core/`; server orchestration in `src/lib/server/*.server.ts`; browser entry points in `src/lib/api/*.functions.ts`, all operator-guarded.
- Server results must be plain JSON; agent outcomes use `outcomeDto`/`toJson`.
- Database schema, migrations and generated files are managed by Lovable, not edited by hand. Secrets stay in Cloud Secrets; `LOVABLE_API_KEY` never enters browser code.
- No new runtime dependencies for the visual layer; the project already uses TanStack Start, React, Tailwind v4, lucide-react and the shadcn-style `components/ui` kit.
- Calculations fail closed: no invented zeros, percentages, forecasts or extrapolations when data is missing.
- Exposing the local service beyond loopback requires a new approved ADR and explicit authorization. No tunnel or domain is part of this visual work.

## Brand Commitments

- Name: CentralIA, with “IA” highlighted in the existing wordmark.
- Voice: direct, plain Portuguese, sentence case. The landing states: “Agentes de IA que pedem licença antes de agir.”
- Established vocabulary: gates, aprovação, auditoria encadeada, kill switch, execuções, leituras derivadas.
- Existing visual identity is a dark “control room”: graphite console, amber signal light, monospaced instrument readouts. It is the incumbent system and may be replaced by a new visual world, but the product facts above stay.

## Evidence on Hand

- `src/routes/index.tsx`: current landing copy and rules (INV-01..04).
- `src/routes/_authenticated/_app/route.tsx`: navigation and shell labels.
- `src/styles.css`: incumbent tokens and utilities (`console-grid`, `panel`, `readout`, `eyebrow`, `signal-dot`, `animate-signal`).
- `src/components/console.tsx`: shared `PageHeader`, `Panel`, `Outcome`, `Stat`, `StatusBadge` and timestamp formatter.
- `roadmap.md`: verified operator flows, audit-chain checks and phone-width verification.
- No testimonials, customer logos, pricing or third-party proof exist; none may be invented.

## Product Principles

- Automation must be legible at a glance: what ran, what was refused, and what is waiting for a person.
- Deterministic calculations are the source of truth; the model never supplies numbers.
- Absence is stated explicitly, never filled with fabricated data.
- Safety controls stay visible and reversible only through the established approval path.
- The same clarity must hold at phone width.

## Accessibility & Inclusion

No product-specific requirement beyond the established need to work at desktop and phone widths. Maintain visible keyboard focus and readable contrast in whatever visual world is chosen.
