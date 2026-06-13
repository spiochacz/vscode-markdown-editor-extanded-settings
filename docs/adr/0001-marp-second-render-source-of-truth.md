# ADR-0001 — Marp deck is a second, independent render of the source (read-only); Markdown stays the single source of truth

- **Status:** Accepted
- **Date:** 2026-06-13
- **Tags:** marp, rendering, architecture
- **Related:** `docs/superpowers/specs/2026-06-12-marp-split-panel-design.md`, ADR-0002 (preview-surface integration), ADR-0003 (lazy marp chunk — proposed)

## Context

vMarkd is a custom Markdown editor built on **Vditor + Lute** (Go→WASM serializer). Task 107 adds **Marp** presentation support. Marp is fundamentally different from the block renderers vMarkd already integrates (mermaid, echarts, callouts — one fence → one widget):

- Marp is **document-level**: a `marp: true` key in the leading YAML frontmatter turns the whole file into a slide deck; a top-level `---` becomes a slide break; per-slide directives live in HTML comments.
- The engine, `@marp-team/marp-core`, is **markdown-it based — not Lute/Vditor**. It parses the Markdown itself and emits standalone `{ html, css }`.

We had to decide how the slide deck relates to the editable document.

## Decision

The Marp deck is a **second, independent render of the same source text**, produced by marp-core, shown as **read-only output**. The Markdown text remains the **single source of truth**; the deck is never edited directly and never feeds back into the document.

- **Activation is per-document and zero-cost when off:** `marp: true` frontmatter, detected by a **pure, host-isomorphic** function `parseMarpEnabled` (`src/marp-detect.ts`) used by both the host (initial flag) and the webview (re-evaluated on each render). Non-Marp docs load no Marp code and show no Marp UI.
- **Theming renders as Marp would for export:** the deck honours its own `theme:` directive; vMarkd's editor dark/light pairing is **not** applied to the deck, so the live preview cannot diverge from a future export.

## Alternatives considered

- **Transform Vditor's IR/WYSIWYG DOM into slides** — rejected. It would couple slides to Lute's round-trip and the contenteditable caret machinery, and marp-core's engine doesn't map onto Vditor's DOM. Fragile and not how Marp actually renders.
- **A bespoke slide engine** — rejected. Reinvents marp-core and guarantees divergence from real Marp output/export.
- **Apply vMarkd's content-theme dark/light pairing to the deck** — rejected. The deck would look different from an exported deck; preview must match export.

## Consequences

- **+** Single source of truth — the deck can never corrupt the document; round-trip is unaffected by construction.
- **+** Matches the official `marp-vscode` model (replace the preview renderer wholesale), so behaviour is predictable to Marp users.
- **+** A future export path is consistent with what the user already sees.
- **−** Two renders of the same source coexist (Lute for the normal preview, marp-core for the deck) — accepted cost.
- **−** The deck is read-only: per-slide WYSIWYG editing is explicitly a later phase, not available now.

This ADR establishes the data model. *How* the read-only deck is surfaced in the editor is ADR-0002; *how* marp-core is packaged is ADR-0003 (proposed).
