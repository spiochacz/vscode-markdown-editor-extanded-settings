# Code review — SOLID / SRP / KISS (2026-06-02)

Design-quality review of the vMarkd extension, branch `review/solid-srp-kiss`.
Scope: structure and simplicity, not formatting (biome owns that). Conducted via
three parallel module reviews; the high-impact findings were verified against the
source.

## TL;DR

The codebase is **healthy**. Most modules are small, single-purpose, well
documented, and testable with dependencies injected. The SOLID/SRP problem is
concentrated in **two god-files that were never decomposed**: `src/extension.ts`
(~1400 lines) and `media-src/src/main.ts` (~500 lines). Everything else is mostly
exemplary.

## What is already good (the bar)

- **Host:** `diff-lines.ts`, `git-diff.ts` (textbook Dependency Inversion —
  `ExtensionsLike` / `DiffComputer` injected), `reveal-range.ts`, `reading-time.ts`,
  `lute-host.ts`. Pure, single-purpose, testable without VS Code.
- **Webview:** `source-map.ts`, `diff-markers.ts`, `live-config.ts`,
  `custom-renderer.ts`, `split-scroll-sync.ts`. The "pure core + thin DOM wrapper"
  pattern, documented rationale.

## Structural problems (SRP) — deferred (big splits)

### `extension.ts` — god-file
Mixes activation, command registration, webview-HTML templating (CSP, instant-paint
overlay, theme/font), the webview message router (12-case switch, ~260 lines),
options persistence + sanitization, CSS aggregation, wiki-link UI flows, image
upload. The core is `resolveCustomTextEditor` (~560 lines): one function with ~15
closure variables, 5 watchers/listeners, and the message switch — none of it
independently testable.

Proposed split (for a future, dedicated effort): `webview-html.ts` (+ `buildCsp`,
`buildPrerenderOverlay`, `resolveFontSizeCss`, `resolveSavedMode`),
`message-router.ts` (handler map), `editor-session.ts` (class replacing the giant
closure: `activeUri`/sync/watchers/rename/diff/live-config as fields+methods),
`vditor-options.ts`, `css.ts`, `assets.ts` (+ `uploadImages`), `wiki-handlers.ts`,
`commands.ts`, `tab-utils.ts`, `status-bar.ts`.

### `main.ts` — god-module
`initVditor` (~178 lines) + an inline message-router switch (~130 lines) + caret
tracking + theme + overlay lifecycle, coupled through module-global mutable state
(`lastInitMsg`, `applyingExtensionUpdate`).

Proposed split: `message-router.ts` (handler map), `vditor-init.ts`
(`buildVditorOptions` / `runAfterHooks`), `vditor-theme.ts`, `prerender-overlay.ts`,
`editor-caret.ts`, optionally an `EditorSession` holding the shared state.

Both share an OCP smell: the message `switch` grows with every command → wants to be
a handler map.

## Verified bugs / smells (the quick wins)

- **`lute-host.ts` `prerenderPrefix` fence guard** — count `/^```/gm` (offset-0
  included) vs trim `lastIndexOf('\n```')` (needs a preceding newline) anchor
  mismatch: a doc opening with an unterminated fence was counted-odd but not
  trimmed. **Fixed** (commit on this branch) + regression test.
- **`extension.ts` upload handler (~1072–1090)** — on `createDirectory` failure it
  shows the error but falls through to `writeFile` anyway (no `break`), and uses
  raw `console.error` instead of the `debug`/logger channel.
- **Option-key duplication** — the `ready` init payload and `postLiveConfig`
  hand-list the same 14 `config.get` keys; adding an option means editing both in
  lockstep. → one `collectConfigOptions()` helper.
- **Duplicated DOM helper** — `source-map.activeModeElement` and
  `diff-markers.findEditorElement` are byte-identical. → import the shared one.
- **Mac detection** — `navigator.platform...includes('mac')` inlined in `main.ts`,
  `fix-table-ir.ts` (×2), `undo-keybind.ts`. → one `isMac()` leaf helper.
- **`fontSizeCss`** — a four-level nested ternary in `_getHtmlForWebview`,
  conceptually mirroring `resolveFontSize()` in `live-config.ts` (separate bundles,
  so not cross-shareable). → extract a readable local `resolveFontSizeCss`.

## Lower-priority notes (not actioned)

- `wiki.ts`: `resolveWikiLink` re-walks the whole wiki tree on every link click (no
  caching); pure key-normalization is welded to `vscode` (untestable without it).
- `fix-table-ir.ts`: ~70-line HTML template literal nested inside a closure.
- `toolbar.ts`: large inline SVG strings could move to an `icons.ts`; link-insertion
  helpers are a separable concern.
- `utils.ts`: import-time side effects (`window.vscode = acquireVsCodeApi()`) hidden
  in a "utils" module — belongs in an explicit bootstrap.
- `custom-renderer.ts`: shared global-flag regex forces defensive `lastIndex`
  resets.

## Decision

Per review: applied the **quick wins** (verified bugs + low-risk dedup) on this
branch; the two god-file splits are recorded here as a deferred, dedicated effort
(they are large, opinionated changes better done in isolation with their own PR).
