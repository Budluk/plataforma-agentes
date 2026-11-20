<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## CentralIA architecture

- Site release uses an atomic operator-only database function to consume a valid saved-content approval, enforce the kill switch, append the audit and expose an immutable public copy; social publishing stays on its separate simulated path.

- Pure agent logic (contracts, gates, parsers, calculators) lives in `src/lib/core/` with no I/O, so it is unit-testable and shared by client and server.
- Server-only orchestration lives in `src/lib/server/*.server.ts`; browser-callable entry points are `src/lib/api/*.functions.ts`, all guarded by `requireOperator` because every agent action is operator-only.
- Audit and approval hashes use the Python-compatible canonical JSON in `src/lib/core/canonical.ts` and exact timestamps (`ts_exact`); never re-serialize stored audit `detail` text, or the imported hash chain breaks.
- Audit, approval and kill-switch writes go through database functions (append-only triggers); do not write those tables directly from app code.
- Research, summary, funnel analysis and saved-content stages append completion records through Runtime.auditStage; a missing audit write cannot be reported as a completed stage.
- LLM calls go through `src/lib/server/llm.server.ts`: Groq when `GROQ_API_KEY` is set, Lovable AI otherwise, so the provider can switch without touching agents.
- Server function results must be plain JSON; wrap agent outcomes with `outcomeDto`/`toJson` from `src/lib/core/json.ts`.
- Runtime settings and per-agent preferences are read from operator-only tables on each request; custom prompts supplement rather than replace fixed contracts and gates, and private keys stay in Cloud Secrets.
- Every tool name, its owning agent, required parameters and sequencing come from the single registry in `src/lib/core/toolRegistry.ts`; no other layer may hardcode a tool name, so monitor rules, permission seeds and studio dispatch stay in sync.
- The CloneStudio client (`src/lib/server/studio.server.ts`) is the only place that reaches the service: http only on loopback, https only for a host the operator listed in `STUDIO_ALLOWED_HOSTS`, no redirects, a hard response ceiling, and answers reduced to allowlisted fields. Any new studio capability is added through the closed action -> gate -> monitor -> permission path, never as a direct call.
