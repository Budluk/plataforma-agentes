---
name: CentralIA
description: Um instrumento de operação ao vivo para agentes de IA com freio de mão.
colors:
  go-lime: "oklch(0.88 0.2 108)"
  graphite: "oklch(0.145 0.014 258)"
  bay: "oklch(0.175 0.015 258)"
  bay-raised: "oklch(0.205 0.018 258)"
  hold-amber: "oklch(0.83 0.16 68)"
  refuse-coral: "oklch(0.66 0.21 20)"
  info-sky: "oklch(0.77 0.12 225)"
  approved-green: "oklch(0.8 0.16 150)"
  rail-slate: "oklch(0.38 0.022 255)"
  ink: "oklch(0.94 0.01 92)"
  # Scoped Balcão storefront tokens (.shopfront); not console defaults.
  counter-paper: "#f5f5f1"
  counter-card: "#ffffff"
  counter-ink: "#17191b"
  counter-line: "#c9ccca"
  counter-soft: "#e9ebe7"
  counter-red: "#cc202c"
  counter-muted: "#4e5558"
  counter-console: "#121317"
typography:
  display:
    fontFamily: "IBM Plex Sans Condensed, IBM Plex Sans, ui-sans-serif, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.015em"
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.16em"
  counter-display:
    fontFamily: "IBM Plex Sans Condensed, IBM Plex Sans, ui-sans-serif, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.875rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  counter-label:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.5625rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.1em"
rounded:
  none: "0"
  sm: "0.25rem"
  md: "0.25rem"
  lg: "0.375rem"
  xl: "0.625rem"
spacing:
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.go-lime}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  button-signal:
    backgroundColor: "{colors.go-lime}"
    textColor: "{colors.graphite}"
    typography: "IBM Plex Mono, uppercase, 0.75rem"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1.25rem"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  panel-bay:
    backgroundColor: "{colors.bay}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  status-badge:
    backgroundColor: "{colors.bay}"
    textColor: "{colors.go-lime}"
    rounded: "{rounded.sm}"
    padding: "0.125rem 0.5rem"
  counter-tile:
    backgroundColor: "{colors.counter-card}"
    textColor: "{colors.counter-ink}"
    rounded: "{rounded.none}"
    padding: "0.875rem"
  counter-tag:
    backgroundColor: "{colors.counter-red}"
    textColor: "{colors.counter-card}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.375rem"
  counter-lead-cta:
    backgroundColor: "{colors.counter-ink}"
    textColor: "{colors.counter-card}"
    rounded: "{rounded.none}"
    padding: "0.625rem 0.875rem"
---

# Design System: CentralIA

## Overview

**Creative North Star: "The Slipstream Console"**

CentralIA looks like the instrument panel of a machine that is already running. The operator does not read a report about automation; they watch work move. A request enters on the left, crosses three closed checkpoints, and leaves as an audited execution — the motion is the argument. Density is high but never noisy: every surface is a labelled bay, every number is a monospaced readout, and the only bright colour on the screen means "this is moving" or "this needs you".

The palette refuses the generic neon-on-black dashboard by giving colour a job instead of a mood. Lime is the GO signal, amber is a person being asked, coral is a refusal, sky is information. Everything else is cold graphite with fine technical grids. Type is industrial: condensed capitals for headings, tabular mono for values, quiet sans for prose. Motion is material — a scanning sweep, a traveller on the routing track, a breathing status dot — and stops completely under reduced motion.

The sales area is a second, deliberately scoped voice: a counter-paper storefront inside the console. It opts in through `.shopfront`; its `counter-*` tokens and `.sf-*` classes stay inside that boundary. The shelf is a dense paper catalogue of sample goods and real tools, while the dark backroom reconnects the surface to the instrument world above. Adding the vitrine does not make the counter-paper palette a default for new screens.

**Key Characteristics:**

- Live telemetry before static summary.
- One accent with semantic discipline.
- Instrument bays with corner ticks instead of soft cards.
- Tabular monospaced numerals everywhere.
- Small radii, hairline borders, tonal depth.
- Scoped counter-paper world for the demo storefront, never a console default.

## Colors

Cold, narrow and functional: neutral graphite carries the surface, four semantic colours carry the state.

### Primary

- **Go Lime** (`oklch(0.88 0.2 108)`): the single committed accent. Signals automated/running, marks the primary action, the active row, the routing traveller and key readouts. Its rarity is the point.

### Status (named rules)

- **Hold Amber** (`oklch(0.83 0.16 68)`): only for approvals waiting on a person and pending counters.
- **Refuse Coral** (`oklch(0.66 0.21 20)`): only for gates that rejected, failures, and the kill switch.
- **Approved Green** (`oklch(0.8 0.16 150)`): only for "operante" / "aprovado" states; deliberately distinct from Go Lime.
- **Info Sky** (`oklch(0.77 0.12 225)`): neutral exposition such as provider names and JSON values.

### Neutral

- **Graphite** (`oklch(0.145 0.014 258)`): page ground and header text inverse.
- **Bay** (`oklch(0.175 0.015 258)`) / **Bay Raised** (`oklch(0.205 0.018 258)`): panel surfaces, the latter used in the diagonal gradient.
- **Rail Slate** (`oklch(0.38 0.022 255)`): panel top edge and dividers.
- **Ink** (`oklch(0.94 0.01 92)`): primary text.

### Scoped counter-paper world (`/vendas`)

The storefront uses its own paper vocabulary; these colours are only valid inside `.shopfront`.

- **Counter Paper** (`#f5f5f1`): the ground behind the shelf, slightly warm so white tiles read as pasted on.
- **Counter Card** (`#ffffff`): tile, search and lead-desk surfaces; the paper never becomes a white page.
- **Counter Ink** (`#17191b`): titles, tile names, primary buttons and the footer ground.
- **Counter Soft** (`#e9ebe7`): the neutral plate under CSS-drawn tile art.
- **Counter Line** (`#c9ccca`): one-pixel hairlines and the gap that separates mosaic tiles.
- **Counter Red** (`#cc202c`): the only counter accent — sample tags, prices, discounts, masthead rule and focus. It signals illustration, not a live GO state.
- **Counter Muted** (`#4e5558`): secondary copy, codes and price notes.
- **Counter Console** (`#121317`): the real-tools backroom, which inherits the main console's foreground tokens.

**The Scoped Counter Rule.** Counter colours exist only under `.shopfront`; never use them to restyle the console shell or imply a product claim is real.

**The One Signal Rule.** Go Lime never decorates. It marks motion, the primary action, or a live value — nothing else gets it.

**The Status-is-Colour Rule.** Amber, coral, green and sky are reserved vocabulary. Never borrow one for emphasis or decoration.

## Typography

**Display Font:** IBM Plex Sans Condensed (with IBM Plex Sans fallback)
**Body Font:** IBM Plex Sans (with system sans fallback)
**Label/Mono Font:** IBM Plex Mono

**Character:** condensed capitals give headings the stamped authority of equipment labelling; the mono face makes every figure feel measured rather than asserted.

### Hierarchy

- **Display** (600, clamp 3rem–4.5rem, 0.95): landing hero and auth headline, uppercase.
- **Headline** (600, 2.25rem–3rem, 0.95): page titles in `PageHeader`, uppercase.
- **Title** (600, 1.125rem): section and bay headings.
- **Body** (400, 0.875rem, 1.6): prose and table cells, max ~65ch.
- **Label** (500, 0.6875rem, 0.16em, uppercase): eyebrows, column headers, badges, all numerals via `.readout` with `tabular-nums`.

### Scoped counter-paper world (`/vendas`)

- **Counter Display** (700, clamp 1.75rem–2.875rem, 0.95, -0.02em): uppercase lead and shelf titles; tile names stay at 700, 1.25rem.
- **Counter Label** (600, 0.5625rem, 0.1em, uppercase): red sample tags, codes and price notes.
- **Counter Figure** (600, 1.1875rem, -0.03em): IBM Plex Mono prices and the lead figure, always paired with a sample mark.

**The Readout Rule.** Every number, timestamp, status and code-like value uses IBM Plex Mono with tabular figures. If it can be compared, it must align.

## Layout

A 6xl content column (`max-w-6xl`) inside a sticky 12-unit telemetry strip and a 240px sidebar on desktop. The landing is a two-column grid above 1024px — copy left, live routing diagram right — that collapses to a single column below it. The authenticated shell keeps the telemetry strip at all widths; the sidebar becomes a horizontally scrolling mono tab strip on mobile. Vertical rhythm is 12/16/24/32px; section headers carry more space above than below.

Scoped to `.shopfront`, the page uses a 1280px wrap with 20px gutters (32px from 768px). The first viewport leads with a one-column desk that becomes two columns from 900px, followed by a 12-column mosaic with 1px hairline gaps: small tiles span 6 columns at 640px and 3 from 900px, medium tiles span 4, large tiles span 6. The real-tools backroom returns to two columns from 1000px.

## Elevation & Depth

Flat by default. Depth comes from tonal layering — a 155° gradient from Bay Raised to Bay — and a 1px border whose top edge is lighter. Shadows are ambient and almost invisible, used only to seat a bay in the ground.

### Shadow Vocabulary

- **Panel seat** (`0 1px 0 0 oklch(1 0 0 / 5%) inset, 0 18px 40px -24px oklch(0 0 0 / 85%)`): every bay.
- **Signal glow** (`0 0 0 1px oklch(0.88 0.2 108 / 45%), 0 0 28px -8px oklch(0.88 0.2 108 / 60%)`): only the primary action and the live traveller.

**The Flat-By-Default Rule.** No card floats at rest. Glow belongs to the GO state, not to decoration.

### Scoped counter-paper world (`/vendas`)

The shelf is also flat: separation comes from 1px hairlines, the 4px red masthead rule and tonal paper layers. Only two soft shadows exist — `0 2px 7px rgb(17 21 23 / 12%)` under the search field and `0 2px 8px rgb(0 0 0 / 28%)` under the brand mark. An active tile uses a 2px inset red ring, not a lift. Hard offset shadows are banned in this world.

## Shapes

Small radii (3px buttons, 6px panels) keep the language closer to rack-mounted equipment than to SaaS cards. Bays carry two 12px corner ticks in Go Lime (top-left, bottom-right) and optionally a 2px left signal rail. The routing diagram uses circles for nodes and a hairline track for flow. Nothing is pill-shaped except status dots.

Scoped to `.shopfront`, the counter is square: tiles, tags, search, CTA and empty state use 0px radius and hairline borders. Circles appear only inside CSS-drawn tile art (rings and dots). Focus is a 2px Counter Red outline with 2px offset — never a coloured halo.

## Components

### Buttons

- **Shape:** 3px radius, 36px default height, 12px horizontal padding.
- **Primary / Signal:** Go Lime ground, graphite text; `signal` adds uppercase mono, 0.12em tracking and the signal glow.
- **Outline:** hairline input border, transparent ground; hover raises the border to Go Lime at 60%.
- **Hover / Focus:** 150ms transition, 0.98 press scale, 2px lime focus ring with 2px offset.

### Telemetry strip

- Always visible, 48px tall, blurred graphite at 92% opacity. Live dot, system state, then execution / alert / pending counters in mono.

### Panel bay

- Gradient surface, lighter top edge, two corner ticks, optional left rail. Header is a mono eyebrow with a 4px lime dot and a bottom divider.

### Status badges

- 3px radius, uppercased mono, 10% tint of the semantic colour on a bay ground with a 40% border of the same colour.

### Routing diagram

- Four labelled nodes joined by three animated dotted tracks. A lime traveller crosses each track on a staggered delay; the effect is disabled under reduced motion.

### Scoped counter tile

- Square white card on a 1px Counter Line grid, 14px padding; the gap between tiles is the grid line, not whitespace.
- Red tab labels and prices are the only colour; CSS-pattern art sits on Counter Soft without raster images.
- Clicking a tile loads its sample numbers into the real backroom; the tile itself never claims a transaction.

### Scoped sample tag

- Counter Red ground, white mono uppercase at 0.5625rem, 4px by 6px padding, 0 radius.
- Every invented figure in the first viewport carries one; removing it turns the demo into a false commercial claim.

### Scoped lead CTA

- Square Counter Ink button with 10px by 14px padding, mono uppercase at 0.625rem and a 2px Counter Red focus outline.
- Hover swaps the ground to Counter Red; it is an anchor to `#sf-calculo`, so it works before hydration.

### Scoped backroom

- Counter Console ground with a 4px Counter Red top rule; foreground and muted foreground come from the main console tokens.
- This is where `runSales`, `runFunnel`, `buildSalesReport` and `trendsQuery` remain reachable; demo prices never enter these calculations as facts.

## Do's and Don'ts

### Do:

- **Do** lead with what is running; **do** label every figure in mono; **do** keep colour semantic; **do** state absence explicitly.
- **Do** keep every `counter-*` token and `.sf-*` rule inside `.shopfront`.
- **Do** mark invented shelf figures as `sample`, including prices, discounts and percentages.
- **Do** keep the real calculators in the dark backroom with the console's own foreground tokens.

### Don't:

- **Don't** use lime as decoration; **don't** invent zeros or percentages to fill a bay; **don't** round panels like consumer cards; **don't** add a second decorative animation when the telemetry already moves.
- **Don't** use Counter Red as a GO signal or borrow it for the console shell.
- **Don't** add hard offset shadows, consumer radii or raster product art to the shelf.
- **Don't** promote a demo price or discount into a real commercial claim.
