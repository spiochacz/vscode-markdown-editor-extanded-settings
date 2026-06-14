# ADR-0004 — Patching Vditor: where to patch so it reaches the surface that loads it

- **Status:** Accepted
- **Date:** 2026-06-14
- **Tags:** vditor, build, esbuild, css, patching, architecture
- **Related:** ADR-0003 (CSS theming — "behaviour → esbuild TS patch", "Vditor-origin CSS → build-time source-patch"), `media-src/esbuild-shared.mjs` (`vditorSourceConfig.plugins`), `build.mjs` (`patchVditorIndexCss`, `varifyVditorPalette`, `syncVditorAssets`).

## Context

vMarkd embeds **Vditor** (vendored under `media-src/node_modules/vditor`) and must change some of its
behaviour and CSS. A fork is on the table long-term, but until then we patch at build time. We have
several patch mechanisms, and a **non-obvious trap**: the same Vditor asset can exist in **two copies
loaded by different surfaces**, so a patch that targets the wrong copy silently does nothing on the
surface you care about — while still looking "fixed" in the harness.

The trap that motivated this ADR (2026-06-14): Vditor's `index.css` WYSIWYG inline-code padding fix
was applied by `build.mjs patchVditorIndexCss` to `media/vditor/dist/index.css`, the harness went
green (3px), **but the real editor still showed Vditor's `0 !important`** — because the editor loads
`index.css` from a *different* copy (bundled into `media/dist/main.css` via `main.ts: import
'vditor/dist/index.css'`, from the UNPATCHED node_modules), not the `media/` copy. The harness loads
the `media/` copy, so it could never reproduce it.

## The two copies of every Vditor asset

| Copy | Where it comes from | Which surfaces LOAD it |
|---|---|---|
| **Bundled** | `import '…'` in `media-src/src/*.ts` → esbuild bundles it (from **node_modules**) into `media/dist/main.{js,css}` | the **real editor** (html-builder `<link>`s `media/dist/main.css` + `main.js`) |
| **Copied (`media/vditor/dist/…`)** | `build.mjs syncVditorAssets()` copies node_modules→`media/` | the **Playwright harness** (`/vditor/…` link), the **HTML-export** feature (`export/index.ts` `<link>`), and anything Vditor loads at runtime via `${cdn}/dist/…` |

A patch reaches a surface **only if it targets the copy that surface loads.**

## Decision

### Three patch mechanisms — pick by what you're changing AND which copy the surface loads

1. **Vditor TS behaviour** → **esbuild `onLoad` TS patch** in `vditorSourceConfig.plugins`
   (`media-src/esbuild-shared.mjs`). Filters the `.ts` file, string-replaces an **asserted anchor**,
   returns `{loader:'ts', contents}`. Reaches the **bundle** (editor). Examples: `fixIrBlurExpand`,
   `fixMathRender`, `fixMermaidVersion`, `fixSetContentTheme`.

2. **Vditor CSS that is `import`ed into the bundle** (e.g. `main.ts: import 'vditor/dist/index.css'`)
   → **esbuild `onLoad` CSS patch** in the SAME `plugins` array. Filter `/vditor[/\\]dist[/\\]…\.css$/`,
   replace an asserted anchor, return `{loader:'css', contents}`. **This is the one that reaches the
   editor** for index.css rules. Example: `fixIndexCssWysiwygPad`.

3. **Vditor CSS in the copied `media/` assets** (served by `<link>` to the harness / export / runtime
   `${cdn}`) → **`build.mjs` source-patch** of the copied file, run AFTER `syncVditorAssets()`.
   Examples: `varifyVditorPalette` (palette → `var(--vmarkd-*)`), `patchVditorIndexCss`.

### Rules for every patch

- **Anchor-assert and throw on miss.** Each patch checks its exact source anchor and throws a named
  error if absent, so a Vditor version bump **fails the build loudly** instead of silently no-op-ing.
- **Patch the copy the target surface loads** (see the table). If a rule must apply on BOTH the editor
  and the harness/export, **patch both** (esbuild import patch + `build.mjs` copy patch) and keep the
  two rewrites identical. (index.css inline-code padding does exactly this.)
- **Token-drive values** where a theme should vary them: rewrite to `var(--vmarkd-*, <default>)` rather
  than a literal, so themes stay the single source (ADR-0003).
- **Prefer fixing Vditor's own rule at the source over a higher-specificity override in `main.css`.**
  An override leaves Vditor's wrong rule in place plus a rule to maintain; patching the source makes
  the actual rule correct (cleaner cascade, nothing to out-rank). Reserve `main.css` `!important` for
  what we genuinely can't patch (VS Code injected defaults — ADR-0003).
- **Verify in the REAL webview, not just the harness.** The harness loads the `media/` copy and the
  bundle, so it can mask a bundled-copy miss (and vice-versa). Use the real-vscode suite
  (`test/vscode-e2e/`) for anything touching a Vditor asset; it loads exactly what ships.

## Alternatives considered

- **Runtime `main.css` override** (higher specificity + `!important`) instead of patching the source —
  works and reaches the editor (main.css is bundled), but leaves Vditor's wrong rule and an override to
  maintain. Use only when the rule can't be patched at source. (We did this first for the inline-code
  padding, then replaced it with the import patch.)
- **Patch the node_modules file in place** before bundling — fragile: `npm ci` / reinstall resets it,
  and it's not reproducible. The esbuild `onLoad` rewrite is hermetic (operates on read, not on disk).
- **Cache-buster (`?v=`) on index.css** — does NOT apply: index.css isn't loaded via a cacheable
  `<link>` in the editor, it's bundled. (`?v=` matters only for runtime-`<link>`-loaded vendored JS like
  mermaid/echarts — `fixMermaidVersion` — and the export/runtime index.css link.)
- **Fork Vditor** — the accepted long-term backstop; until then, anchor-asserted build patches.

## Consequences

- **+** A clear decision table: change-type × which-copy → which mechanism. No more "patched it but the
  editor didn't change."
- **+** Anchor asserts turn a Vditor bump into a loud build failure at the exact patch site.
- **−** Some rules need patching in **two** places (esbuild import + `build.mjs` copy) to cover editor +
  harness/export; they must be kept in sync (documented at each patch site).
- **−** Relies on Vditor source anchors — drift risk, mitigated by the asserts; a fork removes it.
- **−** Requires the real-vscode suite (slower, ad-hoc, WSLg/display) to truly verify Vditor-asset patches.
