# Plan: port features from better-markdown-editor

Features selected from the **`masterofarbs-audiodub/better-markdown-editor`** fork
(42 ahead of zaaack, Vditor 3.8.4, pushed 2026-05-28). We port them onto our
**Vditor 3.11.2** base — keeping our architecture (`CustomTextEditorProvider`,
no jQuery, wiki links, two-way sync) and taking only the good parts.

Order by value/cost: quick wins first, then optional tracks.

---

## 1. Search Cmd+F / Ctrl+F  🟢 high value / trivial cost

> **Source:** a keybinding to the built-in `editor.action.webvieweditor.showFind`
> command, scoped to the custom editor. **Half the work is already done** —
> `enableFindWidget: true` is set (`extension.ts:128`); we only lack the keybinding
> to trigger it.

**1.1. `package.json` — add to `contributes.keybindings`** (next to the existing `ctrl+alt+e`)
```jsonc
{
  "key": "ctrl+f",
  "command": "editor.action.webvieweditor.showFind",
  "mac": "cmd+f",
  "when": "activeCustomEditorId == markdown-editor.editor"
}
```
Note: our existing keybinding uses `when` without quotes around the viewType
(`markdown-editor.editor`) — keep the same style for consistency.

**1.2. Manual test** — open a file in the editor, press Ctrl+F → the VS Code
find widget should appear. No webview code change or rebuild needed (pure manifest change).

---

## 2. New settings: highlightHeadings + outlinePosition  🟡 medium value / low cost

> **Source:** `markdown-editor.highlightHeadings` (background/color for h1–h6) and
> `markdown-editor.outlinePosition` (`left`/`right`). We already have the outline
> in the toolbar (`toolbar.ts:171`), so `outlinePosition` makes sense for us right away.

**2.1. `package.json` — `contributes.configuration.properties`**
```jsonc
"markdown-editor.highlightHeadings": {
  "type": "boolean",
  "default": false,
  "description": "Apply a themed background/foreground to headings (h1–h6) for easier scanning."
},
"markdown-editor.outlinePosition": {
  "type": "string",
  "enum": ["left", "right"],
  "default": "right",
  "description": "Which side the outline panel opens on."
}
```

**2.2. `src/extension.ts` — pass to the webview** (`options:` block in the `ready` handler, ~`extension.ts:318`)
```ts
highlightHeadings: MarkdownEditorProvider.config.get<boolean>('highlightHeadings'),
outlinePosition: MarkdownEditorProvider.config.get<string>('outlinePosition'),
```

**2.3. `media-src/src/main.ts` — wiring**
- `outlinePosition` → Vditor's `outline.position` option:
  ```ts
  if (msg.options && msg.options.outlinePosition) {
    defaultOptions = deepMerge(defaultOptions, {
      outline: { position: msg.options.outlinePosition },
    })
  }
  ```
- `highlightHeadings` → an attribute on `body` (same pattern as `data-full-width`
  in `extension.ts`/`main.ts`):
  set `document.body.setAttribute('data-highlight-headings', msg.options.highlightHeadings ? '1' : '0')`
  next to the existing attributes (on `init`).

**2.4. `media-src/src/main.css` — style for the attribute**
```css
body[data-highlight-headings="1"] .vditor-reset h1,
body[data-highlight-headings="1"] .vditor-reset h2 /* … h3–h6 */ {
  background: var(--vscode-textBlockQuote-background);
  padding: 0 .3em;
  border-radius: 3px;
}
```

**2.5. Rebuild** the webview (`foy build` / esbuild) — `main.ts` + `main.css` changed.

---

## 3. Perf: debounce + drop onLanguage  🟡 medium value / low cost

> **Source:** edit debounce 100 ms → 250 ms (fewer `applyEdit` calls), removing
> `onLanguage:markdown` from `activationEvents` (faster startup, less eager activation).

**3.1. `package.json` — remove `onLanguage:markdown`** from `activationEvents`.
Remaining: `onCommand:markdown-editor.openEditor`, `onCommand:markdown-editor.openTextEditor`,
`onCustomEditor:markdown-editor.editor`. The custom editor activates the extension
on opening a `.md` anyway, so `onLanguage` is redundant.

**3.2. Debounce** — raise it:
- `media-src/src/main.ts:101` — `input()` debounce `100` → `250`
- (optional) `extension.ts` `schedulePostUpdate` uses `75 ms` — that's the other
  direction (file→webview); leave it or raise slightly; less critical.

⚠️ Test: after raising the debounce, verify that fast typing + an immediate save
(Ctrl+S) doesn't drop the last characters (save must flush the pending edit).

---

## 4. Editor from source: source-import Vditor → tree-shake + VDITOR_VERSION fix  🟢 SELECTED

> **Source:** a custom `build.mjs` (esbuild driver) with an `onResolve` plugin
> that stubs out unused Vditor toolbar buttons (`Br`, `Fullscreen`, `Record`,
> `Export`) → bundle −49% (805→407 KB, then 375 KB). Requires importing Vditor
> **from source** (`vditor/src/index`) instead of the pre-bundle — which surfaces
> two bugs they already solved, plus **a third one they did NOT have (LESS, see 4.5)**.

### Feasibility on 3.11.2 — VERIFIED (2026-05-29)
Checked in `media-src/node_modules/vditor@3.11.2`:
- ✅ Source entry exists: `vditor/src/index.ts` (`main` in package.json is
  `dist/index.js`, no `module` field — hence the explicit `vditor/src/index`).
- ✅ `VDITOR_VERSION` declared as `declare const` in `src/ts/constants.ts:1`,
  used in `constants.ts`, `toolbar/Info.ts`, `index.ts` — **identical to 3.8.4**.
- ✅ Button files to stub exist: `src/ts/toolbar/{Br,Fullscreen,Record,Export}.ts`
  — **the regex and stubs from better-markdown-editor match 1:1**.

So the 3.11.2 structure = the 3.8.4 structure for this mechanism. The recipe ports directly.

> **Context:** today we import `import Vditor from 'vditor'` = the pre-bundled dist,
> where `VDITOR_VERSION` is already substituted — we have no runtime crash (it only
> hit us in the e2e harness). After switching to source-import the problem becomes
> real, so the `define` below is mandatory then.

### 4.1. `media-src/build.mjs` — new esbuild driver (replaces the CLI in package.json)
```js
define: { VDITOR_VERSION: JSON.stringify(vditorPkg.version) },
tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } },
loader: { '.less': 'empty' },          // ← OUR addition, see 4.5
plugins: [stubUnusedVditorButtons],
```
- `define VDITOR_VERSION` → fixes `ReferenceError: VDITOR_VERSION is not defined`.
- `useDefineForClassFields: false` → fixes `Cannot read properties of undefined
  (reading 'appendChild')` in `MenuItem.ts` (Vditor relies on legacy class-field
  semantics; esbuild's default breaks them).
- the `onResolve` plugin redirects the 4 unused buttons to a stub.

Full contents of `build.mjs`, `stubs/vditor-toolbar-stubs.ts`, and `config.ts` —
copy from better-markdown-editor (`media-src/` on the `master` branch), since the
source structure is identical.

### 4.2. `media-src/src/stubs/vditor-toolbar-stubs.ts` (new)
4 empty classes `extends StubElement { element = document.createElement('div') }`:
`Br`, `Fullscreen`, `Record`, `Export`. esbuild can't eliminate these modules on
its own because `toolbar/index.ts` imports them unconditionally and has live
`new ClassName()` calls in a switch — hence the manual stub via `onResolve`.

### 4.3. `media-src/src/main.ts` — change the import
```ts
- import Vditor from 'vditor'
+ import Vditor from 'vditor/src/index'   // full source visible to esbuild = tree-shake
  import 'vditor/dist/index.css'          // KEEP — pre-built CSS (see 4.5)
```

### 4.4. `package.json` (media-src) — scripts
`start`/`build` from esbuild CLI → `node build.mjs --watch` / `node build.mjs`.
(Our top-level build goes through `foy` → `syncVditorAssets + tsc + esbuild`;
verify the Foyfile calls the new `build.mjs`, not the old CLI.)

### 4.5. ⚠️ LESS — a 3.11-vs-3.8.4 difference better-markdown-editor did NOT have
`vditor/src/index.ts:1` in **3.11.2** does `import "./assets/less/index.less";`.
esbuild **has no loader for `.less`** and will fail with
`No loader is configured for ".less" files`. better-markdown-editor's build.mjs
(3.8.4) has **no** LESS handling — so their source entry most likely didn't pull
`.less` directly. **This is our 3.11-specific addition.**

Solution (recommended): `loader: { '.less': 'empty' }` — treats the LESS import as
empty, since **we already load the compiled `vditor/dist/index.css`** (kept in 4.3).
Alternatives: the `esbuild-plugin-less` plugin (compiles LESS — unnecessary, we have
the CSS) or an `onResolve` redirecting `.less` to an empty module.

### 4.6. e2e harness
`media-src/e2e/harness.ts` already imports from source and previously crashed on
`VDITOR_VERSION undefined`. After switching to `build.mjs`, Playwright/serve must
use the same define + LESS loader, or the tests will fail again. Verify `serve.mjs`
/ the harness build config.

### Risk & test
Medium-high: touches the build pipeline. After the change, verify that:
(a) the build passes without the LESS error, (b) the editor renders in all modes
(IR/WYSIWYG/SV), (c) the toolbar works (the missing Br/Fullscreen/Record/Export are
unused in `toolbar.ts` anyway), (d) the 19 e2e tests pass, (e) `media/dist/main.js`
actually shrank. Gain: bundle size only — not functionality.

---

## 5. Backend tests: vitest + vscode-mock  🟢 SELECTED

> **Source:** `test/backend` with `vscode-mock.ts` + `jsdom` — they cover
> `extension.ts` (which we don't test; we only have `node:test` on utils + Playwright
> e2e on the webview).

### Runner decision (the key choice)
better-markdown-editor's whole suite assumes **vitest** — `vscode-mock.ts` literally
`import { vi } from 'vitest'`. We currently run **`node:test` (unit) + Playwright (e2e)**.
Faithfully copying their tests means adding vitest as a third runner.

**Recommendation: adopt vitest and consolidate.** Since vitest and `node:test` are both
unit runners (redundant), move our few existing `node:test` unit files (utils, debounce,
deep-merge, format-timestamp) into vitest too. End state:
**vitest (all unit, frontend + backend) + Playwright (e2e)** — two runners, not three.
Add `vitest`, `jsdom` as devDependencies and a `test/vitest.config.ts`.

### What ports 1:1 vs needs rewriting
Their backend tests are written against **their `EditorPanel`** architecture; we're on
**`CustomTextEditorProvider`** (`MarkdownEditorProvider`). So:

| File | Size | Portability |
|---|---|---|
| `test/backend/vscode-mock.ts` | 3.6 KB | 🟢 **Copy + extend.** Generic mock of the `vscode` API (Uri, Range, WorkspaceEdit, workspace, window…). Reusable; just add the surfaces our provider touches (`tabGroups`, `onDidRenameFiles`, `createFileSystemWatcher`, `RelativePattern`, `TabInputText/Custom`). |
| `test/backend/manifest.test.ts` | 2.3 KB | 🟢 **Copy almost as-is.** Asserts `package.json` contributes (settings, keybindings, customEditors). Architecture-agnostic — adjust to our viewType `markdown-editor.editor` + our settings. Highest value/lowest cost. |
| `test/backend/webview-html.test.ts` | 4.1 KB | 🟡 **Rewrite.** Concept ports (assert generated HTML), but against our `_getHtmlForWebview` (base href, CSP, vditor icon script, customCss injection). |
| `test/backend/extension.test.ts` | 11.7 KB | 🔴 **Rewrite from scratch.** Tests their `EditorPanel` (singleton, command-driven). We need new tests for `resolveCustomTextEditor`: two-way sync guards (`applyingWebviewEdit`, `pendingWebviewContent`, `lastSyncedContent`), `ready`/`edit`/`save` messages, wiki init. |
| `test/backend/dispose.test.ts` | 5.1 KB | 🔴 **Rewrite.** Their dispose audit. Our equivalent: `onDidDispose` clears `textEditTimer` + drains `disposables` (`extension.ts:499-507`). Good target once rewritten — pairs well with the rename-tracking plan's disposables. |

### Bonus — directly testable once we have the mock
The **rename-tracking plan (Part B)** becomes unit-testable here: feed a fake
`onDidRenameFiles` event into the mock and assert `activeUri`/`activeFsPath`/title
re-bind and that the close guard (`suppressCloseDispose`) prevents disposal.

### Frontend tests (overlap — take selectively)
Their `test/frontend/*` (debounce, fix-table-ir, lang, message-handler, toolbar, utils)
test webview code close to ours. But we already cover utils/debounce via `node:test`
and fix-table-ir via Playwright. After consolidating to vitest, fold the existing
coverage in and cherry-pick their `message-handler`/`toolbar` cases that we lack.
`test/perf/bundle-size.test.ts` ties into #4 (asserts the bundle stays minified +
under a size cap) — take it together with the tree-shake work.

### Steps
1. Add `vitest` + `jsdom` devDeps, `test/vitest.config.ts`, `test`/`test:watch` scripts.
2. Copy + extend `vscode-mock.ts` for our provider's API surface.
3. Copy `manifest.test.ts`, adapt to our manifest (quick win).
4. Migrate existing `node:test` unit files to vitest (consolidate).
5. Write new `extension`/`dispose` tests against `MarkdownEditorProvider` (+ rename).
6. Keep Playwright e2e untouched.

---

## Implementation order
1. **#1 Search keybinding** — immediate, pure manifest change, zero risk.
2. **#2 settings** + **#3 perf** — together, one webview rebuild, easy to test.
3. **#4 editor from source (tree-shake)** — SELECTED. First `build.mjs` + LESS loader
   (4.5) + define, confirm build and e2e pass, then enable the stub plugin and measure
   size. Do it on a separate branch — it touches the build pipeline.
4. **#5 backend tests** — SELECTED. Adopt vitest + consolidate `node:test` into it.
   Start with `vscode-mock` + `manifest.test` (quick win), then write our own
   `extension`/`dispose`/rename tests against `MarkdownEditorProvider`. Pairs with
   the rename-tracking plan and with #4's `bundle-size` test.
