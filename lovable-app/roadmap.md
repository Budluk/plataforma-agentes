# Roadmap

- [x] Add independent site publication for approved saved drafts, with single-use approval and atomic audit; visitor page is /site, social sends remain simulated.
- [x] Verify publication listing, saved pending approval, content audit #12, public signed-out page and desktop/mobile layout; 51 tests passed.
- [x] Approve and publish saved draft #2 — approval #5 consumed, publication #1 visible to signed-out visitors on /site, audit #21 saved and chain intact; verified desktop/mobile, no new funnel execution.

- [x] Migrate CentralIA (Python CLI) to web control panel on Lovable Cloud
- [x] Confirm AI provider: keep Groq — key saved, live Groq call returns 200
- [x] Confirm access: only the first account is operator
- [x] Verify the app itself reaches Groq through its own runtime (central panel shows "IA: Groq · openai/gpt-oss-20b" and routed a real request)
- [x] Update the panel with the repo's newer code (music tabling, sales/funnel identity, research limit, dev limits + token budget, LLM retries, audit-degraded warnings, tool monitor path-only checks)
- [x] Migrate the new Studio/CloneStudio area (contracts, gate, supervised client, panel page, central routing)
- [x] Studio can reach the operator's machine through one address they choose: http only on loopback, https only for a host listed in STUDIO_ALLOWED_HOSTS
- [x] Studio client sends an optional Bearer token from STUDIO_API_TOKEN only to the exact host named by STUDIO_TOKEN_HOST when a tunneled host requires it
- [ ] User enters a public HTTPS tunnel address and host on Configurações — supplied address is only http://127.0.0.1:8787.
- [x] User operator account exists; verified authenticated access with its own session
- [x] Confirm the requested operator email matches the existing account; inspect sign-in and signup on desktop/mobile
- [x] Add operator-only runtime settings and Groq secret status (key changes remain in Cloud's secure form)
- [x] Add per-agent prompts, temperature, token limits and execution logs
- [x] Verify saved settings and agent execution end-to-end (save/reload, real Groq music request, logs, desktop/mobile)
- [x] Inspect all 11 agents on desktop/mobile in the existing dark theme, expand fixed contracts, refresh logs and inspect secret-update guidance
- [ ] Confirm request reaches CloneStudio after a public tunnel is supplied; tested current local address, health check safely refused with no connection.
- [x] Execute research → summary → funnel analysis → content in the operator panel; verified audit events #9–#12, proposal #5 and saved draft #2 on desktop/mobile; hash chain intact (13 events). Campaign numbers were explicitly a demonstration, nothing published.
- [x] Recheck research/summary and analysis execution at phone width, fix sales-form overflow, and reverify original audit events and saved content; chain intact with 19 events after additional checks.
