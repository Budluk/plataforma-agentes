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
rounded:
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
---

# Design System: CentralIA

## Overview

**Creative North Star: "The Slipstream Console"**

CentralIA looks like the instrument panel of a machine that is already running. The operator does not read a report about automation; they watch work move. A request enters on the left, crosses three closed checkpoints, and leaves as an audited execution — the motion is the argument. Density is high but never noisy: every surface is a labelled bay, every number is a monospaced readout, and the only bright colour on the screen means "this is moving" or "this needs you".

The palette refuses the generic neon-on-black dashboard by giving colour a job instead of a mood. Lime is the GO signal, amber is a person being asked, coral is a refusal, sky is information. Everything else is cold graphite with fine technical grids. Type is industrial: condensed capitals for headings, tabular mono for values, quiet sans for prose. Motion is material — a scanning sweep, a traveller on the routing track, a breathing status dot — and stops completely under reduced motion.

**Key Characteristics:**

- Live telemetry before static summary.
- One accent with semantic discipline.
- Instrument bays with corner ticks instead of soft cards.
- Tabular monospaced numerals everywhere.
- Small radii, hairline borders, tonal depth.

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

**The Readout Rule.** Every number, timestamp, status and code-like value uses IBM Plex Mono with tabular figures. If it can be compared, it must align.

## Layout

A 6xl content column (`max-w-6xl`) inside a sticky 12-unit telemetry strip and a 240px sidebar on desktop. The landing is a two-column grid above 1024px — copy left, live routing diagram right — that collapses to a single column below it. The authenticated shell keeps the telemetry strip at all widths; the sidebar becomes a horizontally scrolling mono tab strip on mobile. Vertical rhythm is 12/16/24/32px; section headers carry more space above than below.

## Elevation & Depth

Flat by default. Depth comes from tonal layering — a 155° gradient from Bay Raised to Bay — and a 1px border whose top edge is lighter. Shadows are ambient and almost invisible, used only to seat a bay in the ground.

### Shadow Vocabulary

- **Panel seat** (`0 1px 0 0 oklch(1 0 0 / 5%) inset, 0 18px 40px -24px oklch(0 0 0 / 85%)`): every bay.
- **Signal glow** (`0 0 0 1px oklch(0.88 0.2 108 / 45%), 0 0 28px -8px oklch(0.88 0.2 108 / 60%)`): only the primary action and the live traveller.

**The Flat-By-Default Rule.** No card floats at rest. Glow belongs to the GO state, not to decoration.

## Shapes

Small radii (3px buttons, 6px panels) keep the language closer to rack-mounted equipment than to SaaS cards. Bays carry two 12px corner ticks in Go Lime (top-left, bottom-right) and optionally a 2px left signal rail. The routing diagram uses circles for nodes and a hairline track for flow. Nothing is pill-shaped except status dots.

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

## Do's and Don'ts

**Do** lead with what is running; **do** label every figure in mono; **do** keep colour semantic; **do** state absence explicitly.

**Don't** use lime as decoration; **don't** invent zeros or percentages to fill a bay; **don't** round panels like consumer cards; **don't** add a second decorative animation when the telemetry already moves.
