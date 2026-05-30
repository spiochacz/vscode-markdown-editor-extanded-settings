# Task: Image resize (drag handles)

> **Source:** `aqz236/vscode-markdown-editor` — `imageResize.ts` (609 LOC), their unique feature
> **Derived from (removed plan):** `aqz236-port-plan.md` §1
> **Value / Risk:** 🟢 high / unique — medium-high (DOM-heavy, no automated coverage)

Take the idea, rewrite the two weak spots. **Spike first**, separate branch.
Gate behind setting `markdown-editor.imageResize` (default **off**).

## 1a. Persistence — avoid `setValue()` full re-render
aqz236 calls `setValue()` on every resize-end → full re-render. We have two-way sync
(`extension.ts`: `applyingWebviewEdit`, `pendingWebviewContent`, `lastSyncedContent`).
Plan: on resize-end set the `<img>` `width`/`height` attributes **in the DOM in
place**, let Vditor's normal `input` flow + our debounced `edit` sync to source — no
`setValue()`.

> ⚠️ **Spike before building UI:** does Lute serialize an inline `<img width height>`
> back into `getValue()` round-trip-stably on 3.11? If it strips attributes, fall
> back to writing source ourselves via `applyEdit` (extension side), still no `setValue`.

## 1b. Markdown syntax
Markdown has no native width syntax. **Recommendation: A** — rewrite to HTML
`<img src alt width height>` (works everywhere), gated behind the `imageResize`
setting so users wanting pristine `![]()` aren't surprised by HTML tags.

## 1c. UI
Port the 8-direction handle overlay + `MutationObserver` rebinding. Constrain to the
active mode element (`vditor.vditor[currentMode].element`), not hard-coded
`.vditor-ir`. Keep aspect-ratio locking on corner handles. New module
`media-src/src/features/image-resize.ts` + CSS in `main.css`.

## Verify
Manual test across IR/WYSIWYG/SV; must survive mode switches and content updates.
No automated coverage (DOM-drag behavior).
