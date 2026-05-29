# Plan: rename tracking + configurable code-block line numbers

Two features adapted from the **`vincent-zheng/vscode-markdown-editor`** fork
(Vditor 3.11.1), reworked for our `CustomTextEditorProvider` architecture.

---

## Part A — Code-block line numbers (as config)

> **Idea source:** `vincent-zheng/vscode-markdown-editor` — in `media-src/src/main.ts`
> he hard-coded `preview.hljs.lineNumber: true` (together with the `xcode` style).
> We turn this into a configurable toggle.

**Goal:** the user enables/disables line numbers in code blocks via a setting.
Default `false` — zero behavior change for existing users.

**A1. `package.json` — new setting** (`contributes.configuration.properties`)
```jsonc
"markdown-editor.codeBlockLineNumbers": {
  "type": "boolean",
  "default": false,
  "description": "Show line numbers in fenced code blocks."
}
```

**A2. `src/extension.ts` — pass it to the webview** (in the `ready` handler, `options:` block, ~`extension.ts:318`)
```ts
codeBlockLineNumbers: MarkdownEditorProvider.config.get<boolean>('codeBlockLineNumbers'),
```
It lands in `msg.options`, so it's already in the webview with no extra work.

**A3. `media-src/src/main.ts` — wire into Vditor** (after merging `msg.options`, ~`main.ts:44`)
```ts
if (msg.options && msg.options.codeBlockLineNumbers) {
  defaultOptions = deepMerge(defaultOptions, {
    preview: { hljs: { lineNumber: true } },
  })
}
```
Use `deepMerge` so we don't overwrite the `hljs.style` set in the dark-theme block.
Order: after the dark-theme merge, so it adds `lineNumber` next to `style`.

**A4. Rebuild** — the `media` dist must be rebuilt (`foy build` / esbuild),
since the webview ships from `media/dist/main.js`.

**Edge case:** line numbers in WYSIWYG/IR mode only apply to the rendered code
preview; the editing view of a block doesn't show them — normal Vditor behavior.

---

## Part B — `onDidRenameFiles` (renaming an open file)

> **Idea source:** `vincent-zheng/vscode-markdown-editor`, commit `b5721dbb`
> ("去掉双向绑定…" / drop two-way binding) — he added
> `onDidRenameFiles → _handleFilePathChange` to handle renaming an open file.
> For him it was required because he kept his own `this._uri` and wrote via
> `fs.writeFile(this._uri)` — a stale URI meant writing to the wrong path.
> We adapt the idea to the `CustomTextEditorProvider` architecture
> (re-bind `activeUri`/`activeFsPath` + guard the close handler).

**Problem:** the provider captures state at open time. After renaming an open file:
- the tab title stays stale (`fsPath` frozen, `extension.ts:185,300`),
- the `fileWatcher` watches the old path → external changes stop coming back,
- the image folder (`getAssetsFolder`) is computed from the old path,
- edits via `applyEdit(document.uri, …)` target the old (now non-existent) URI,
- **worst:** `onDidCloseTextDocument` on the old URI may fire
  `webviewPanel.dispose()` → the tab closes on its own.

> Note: with `CustomTextEditorProvider`, VS Code usually moves the tab to the new
> URI without calling `resolveCustomTextEditor` again, but the `document` object
> captured in the closure stays bound to the old URI. Hence our own re-bind.

**B1. Mutable identity instead of a frozen URI**
At the start of `resolveCustomTextEditor`:
```ts
let activeUri = document.uri
let activeFsPath = document.uri.fsPath
```
Replace the `document.uri.toString()` comparisons (lines 266, 285, 291, 297) and
`fsPath` reads (185, 300, 396, 424) with `activeUri`/`activeFsPath`.
Edits: `edit.replace(activeUri, …)`.

**B2. Extract file-watcher creation into a function**
The current `if (workspaceFolder) {…}` block (`extension.ts:245-262`) → a
`setupFileWatcher(uri)` function returning a disposable, held in a variable so it
can be disposed and recreated after a rename.

**B3. Rename listener**
```ts
disposables.push(
  vscode.workspace.onDidRenameFiles((e) => {
    const hit = e.files.find(f => f.oldUri.toString() === activeUri.toString())
    if (!hit) return
    suppressCloseDispose = true            // see B4
    activeUri = hit.newUri
    activeFsPath = hit.newUri.fsPath
    webviewPanel.title = NodePath.basename(activeFsPath)
    oldWatcher?.dispose()
    oldWatcher = setupFileWatcher(activeUri)
    setTimeout(() => { suppressCloseDispose = false }, 0)
  })
)
```

**B4. Guard the close handler against renames**
`onDidCloseTextDocument` (`extension.ts:290`):
```ts
if (suppressCloseDispose) return
if (closedDocument.uri.toString() !== activeUri.toString()) return
webviewPanel.dispose()
```
Because on rename the old document "closes" — without this flag the panel would vanish.

**B5. Wiki context (optional)**
`wiki` is computed once at startup. If a rename moves the file into/out of a wiki
folder, the context won't update. Conscious decision: leave it for now (rare case)
— record it as a known limitation.

**Edge case:** renaming a parent folder also changes the file URI — `onDidRenameFiles`
then reports the folder's `oldUri`, not the file's. Phase 1 covers **direct file
rename only**; add folder-prefix handling later if needed.

---

## Order & risk
1. **Part A first** — low coupling, purely additive, easy to test.
2. **Part B next** — touches core sync logic; risk of regression. Manual test in
   the Extension Development Host: open a file → rename it in Explorer → verify
   that (a) the tab survives, (b) the title changed, (c) edits save to the new
   file, (d) external changes still flow back to the webview.

No automated tests for B (it's the VS Code API layer, not the webview — our
e2e/Playwright won't catch it).
