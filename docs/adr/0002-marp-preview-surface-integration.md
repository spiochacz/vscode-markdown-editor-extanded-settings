# ADR-0002 — Render the Marp deck inside Vditor's native preview surface via an esbuild gate, not a separate panel

- **Status:** Accepted
- **Date:** 2026-06-13
- **Tags:** marp, vditor, preview, esbuild
- **Related:** ADR-0001 (deck = read-only second render), ADR-0003 (lazy marp chunk — proposed), `docs/superpowers/plans/2026-06-13-marp-preview-integration.md`
- **Supersedes:** the in-session "standalone right panel" approach (implemented, then removed — never recorded as its own ADR).

## Context

Given ADR-0001 (the deck is a read-only second render), where should it appear? The editor has three modes:

- **SPLIT** (`sv`): natively shows Source | Preview, where the preview is the `.vditor-preview` element.
- **IR** and **WYSIWYG**: a toolbar **"Preview"** button toggles the *same* `.vditor-preview` element as a full preview over the editor.

Vditor renders all of these through **one** function (`preview/index.ts`: `let html = vditor.lute.Md2HTML(markdownText); … previewElement.innerHTML = html`). The sv pane (`sv/process.ts`) and the Preview button (`toolbar/Preview.ts`) both call it.

**First implementation (now superseded):** a standalone, always-present right panel + draggable splitter (`marp-panel.ts`) mounted beside *all* editor modes, rendering the deck in its own DOM. In use this was wrong: it duplicated the preview surface, produced a cramped three-column layout in SPLIT, rendered the deck in two places, and did not match the user's mental model — the user expects the existing **Preview** button (and the SPLIT right pane) to show the slides.

## Decision

Render the deck **into Vditor's own preview surface**, by gating Vditor's single preview render with an **esbuild source patch** (`fixPreviewIndex` in `media-src/esbuild-shared.mjs`):

```
let html = (window.__vmarkdRenderMarpPreview
  ? (window.__vmarkdRenderMarpPreview(markdownText) ?? vditor.lute.Md2HTML(markdownText))
  : vditor.lute.Md2HTML(markdownText));
```

The hook (installed by `media-src/src/marp-preview-intercept.ts`) returns the Marp deck HTML for `marp: true` documents, or `null` to fall back to the normal Lute render. **One seam covers all three preview surfaces** (SPLIT pane, IR Preview button, WYSIWYG Preview button). The standalone panel is deleted; caret→active-slide highlight and click-slide→source-offset are retargeted onto the deck inside `.vditor-preview`.

## Alternatives considered

- **Standalone right panel + splitter** (built, then removed) — rejected/superseded. Duplicate surface, three-column SPLIT, deck shown twice, mismatched the "Preview = slides" expectation.
- **MutationObserver post-render rewrite of `.vditor-preview`** — rejected. Fights Vditor's own render pipeline; racing `afterRender()` (which adds syntax highlight / math / mermaid after `innerHTML`).
- **Vditor's `preview.transform` option hook** — rejected. It receives the already-rendered HTML, not the source Markdown, so it cannot re-render with marp-core.

## Consequences

- **+** One interception seam → the deck is consistent across the SPLIT pane and the IR/WYSIWYG Preview button.
- **+** Matches user expectation (the Preview button shows slides).
- **+** Simpler `main.ts` — no separate panel lifecycle, wrapper, or splitter.
- **−** Depends on **patching Vditor source** — anchor-drift risk on a Vditor bump, mitigated by throw-on-missing-anchor. Because esbuild runs only the **first** matching `onLoad` per file, this patch had to be **merged** with the pre-existing `fixPreviewCopyTip` into one `fixPreviewIndex` plugin (both transforms in sequence).
- **−** Vditor's preview render is **synchronous** but the marp chunk loads **async** (ADR-0003): the first render of a deck returns a `"Loading Marp…"` placeholder, then `repaint()` re-runs `preview.render` once the chunk lands (cached thereafter).
- **−** Vditor's `afterRender()` still runs on the injected Marp HTML; needs real-webview verification that it doesn't mangle slide content (e.g. code fences). A follow-up may skip `afterRender` for Marp docs.
- **−** Reverse-nav (click slide → caret) computes a source offset and posts `window.__vmarkdMarpNav`, but **has no host consumer yet** (deferred — to be wired to the existing reveal-in-source plumbing).
