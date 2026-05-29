# Plan: port features from aqz236

Features selected from the **`aqz236/vscode-markdown-editor`** fork (6★, 31 ahead of
zaaack, Vditor 3.8.4, restructured into `src/core` / `src/features` / `src/styles`,
bun build). Ported onto our **Vditor 3.11.2** base.

Centerpiece is **image resize** (their unique feature); the rest are polish + infra.

---

## 1. Image resize (drag handles)  🟢 high value / unique

> **Source:** `media-src/src/features/image/imageResize.ts` (609 LOC) — 8-direction
> drag handles, a `MutationObserver` that re-binds handlers as images appear, working
> across IR/WYSIWYG/SV. On resize-end they convert the image to an HTML
> `<img src alt width height>` tag and replace it in the Markdown via regex, then call
> `vditor.setValue(newContent)`.

**Take the idea, rewrite the two weak spots:**

### 1a. Persistence — avoid `setValue()` full re-render
aqz236 calls `setValue()` on every resize-end → the whole editor re-renders (the exact
problem notemd avoided with its in-place `patch-alt`). We have a **two-way sync** already
(`extension.ts`: `applyingWebviewEdit`, `pendingWebviewContent`, `lastSyncedContent`).

Plan: on resize-end, set the `<img>` element's `width`/`height` attributes **in the DOM
in place**, then let Vditor's normal `input` flow serialize and our existing debounced
`edit` message sync to source — **no `setValue()`**. This reuses the path we already
trust and never interrupts typing.

> ⚠️ **Verify on 3.11:** does Lute serialize an inline `<img width height>` back into
> `getValue()` round-trip-stably? In WYSIWYG, Vditor stores HTML, so it should — but
> confirm with a spike before building the UI. If Lute strips the attributes, fall back
> to writing the source ourselves via `applyEdit` (extension side), still without `setValue`.

### 1b. Markdown syntax — `<img>` vs `![]()`
Markdown has no native width syntax, so persisting a size means leaving plain
`![alt](src)`. Options:
- **A (aqz236):** rewrite to HTML `<img src alt width height>`. Works everywhere, but
  your clean `![]()` becomes HTML.
- **B:** keep `![]()` and store size as a trailing attribute block `{width=...}` —
  only if a Markdown-attributes flavor is in play; Vditor/Lute won't render it natively.
  Likely not worth it.
- **Recommendation:** A, but **gated behind a setting** `markdown-editor.imageResize`
  (default off) so users who want pristine Markdown aren't surprised by HTML tags.

### 1c. UI
Port the 8-direction handle overlay + `MutationObserver` rebinding. Constrain to the
active Vditor mode element (`vditor.vditor[currentMode].element`) rather than hard-coding
`.vditor-ir`. Keep aspect-ratio locking on corner handles (they track `aspectRatio`).
New module `media-src/src/features/image-resize.ts` + CSS in `main.css`.

**Risk:** medium-high — DOM-heavy, must survive mode switches and content updates;
manual test across IR/WYSIWYG/SV. No automated coverage (DOM-drag behavior).

---

## 2. External CSS files + live reload  🟡 medium value

> **Source:** `externalCssFiles` (array of paths) + `cssLoadOrder` ('external-first'),
> with a FileSystemWatcher that reloads styles live when a listed file changes.

We already inject `customCss` in `_getHtmlForWebview` (`extension.ts:563`). Extend:
1. Settings: `markdown-editor.externalCssFiles` (array<string>),
   `markdown-editor.cssLoadOrder` (enum `external-first` | `custom-first`, default
   `external-first`).
2. In `_getHtmlForWebview`, read each external file, order them per `cssLoadOrder`, and
   emit `<style>`/`<link>` tags (use `asWebviewUri` for file links so the CSP allows them;
   verify `localResourceRoots` covers their dirs).
3. Live reload: a `createFileSystemWatcher` over the listed files → on change, re-read and
   `postMessage({ command: 'reload-css', css })`; the webview swaps a dedicated
   `<style id="external-css">` node. Dispose the watcher in `onDidDispose`.

**Risk:** low. CSP + `localResourceRoots` are the only gotchas.

---

## 3. Outline width / position  🟡 medium — MERGE with the better-markdown-editor plan

> **Source:** `showOutlineByDefault`, `outlinePosition` (default `left`), `outlineWidth` (200).

This **overlaps** `outlinePosition` already specified in
`better-markdown-editor-port-plan.md` (§2). Merge, don't duplicate:
- Keep the `outlinePosition` setting from that plan; **add** `outlineWidth` (number, px)
  and `showOutlineByDefault` (boolean) here.
- Wire `outlinePosition` → Vditor `outline.position`, `showOutlineByDefault` →
  `outline.enable`, and `outlineWidth` → CSS var / panel width override in `main.css`.
- Implement once, in whichever plan you execute first; the other just references it.

---

## 4. Toolbar hide + Open in Split  🟡 low value / optional

**4a. `markdown-editor.showToolbar`** (boolean, default true) — pass through `options`;
in `main.ts`, when false, pass an empty/minimal `toolbar` to Vditor (we build it via
`createToolbar`).

**4b. `markdown-editor.openInSplit` command** — open the editor (or the source) in
`ViewColumn.Beside`. We already have `openEditor`/`openTextEditor` using `vscode.openWith`;
add a variant that passes `{ viewColumn: vscode.ViewColumn.Beside }`. Add a keybinding/menu.

> Note: aqz236 registers the custom editor as **both** `priority: default` and `option`.
> We deliberately use `option` only (cleaner true-default-editor) — do **not** copy the
> dual registration.

---

## 5. Infra: bun / i18n / code restructure  🟡 optional, separate track

> **Source:** aqz236 builds with **bun**, added **i18n**, and restructured into
> `src/core` / `src/features` / `src/styles`.

- **bun:** swapping the build runner from npm/esbuild-CLI to bun is orthogonal to features
  and conflicts with the `build.mjs` direction in the better-markdown-editor plan (§4).
  **Pick one build story** — don't do both. Recommendation: stay with esbuild + `build.mjs`
  (needed for the tree-shake plan); skip bun.
- **i18n:** we already have `media-src/src/lang.ts`. Only worth expanding if we add
  user-facing strings (image-resize tooltips, etc.) — fold new strings into the existing
  `lang.ts`, don't adopt aqz236's separate i18n system.
- **Restructure (`features/`):** as we add image-resize (and possibly gutters/reveal from
  the notemd plan), a `media-src/src/features/` folder is a reasonable organic move.
  Do it **incrementally as features land**, not as a big-bang refactor.

---

## Implementation order
1. **#3 outline** — merge into whichever outline plan runs first (cheap, additive).
2. **#1 image resize** — the real work. First a **spike** confirming `<img width>` round-trips
   through Lute on 3.11 (1a), then the handle UI + in-place sync, behind the
   `imageResize` setting. Separate branch.
3. **#2 external CSS** — independent, low risk, do anytime.
4. **#4 toolbar/split** — quick wins, optional.
5. **#5 infra** — skip bun; fold i18n/`features/` in organically. Not a standalone task.
