# Plan: word count, security hardening, table-panel & rendering fixes

Five small items picked from forks not yet covered by the other plans. Sources:
**`Inferno214221/vscode-markdown-editor`** (#1, #3, #4, #5) and
**`nebuk89/vscode-markdown-editor`** (#2). Target: our Vditor 3.11.2 base.

---

## 1. Word count  🟢 trivial / new

> **Source:** Inferno214221 — enabled Vditor's built-in counter via `counter: { enable: true }`.
> It's a one-line Vditor option, not custom code; shows a live word/char count.

**`media-src/src/main.ts`** — add to the `new Vditor('app', { … })` options
(near `cache`, `toolbarConfig`, ~`main.ts:62`):
```ts
counter: { enable: true },          // built-in live word/char counter
```
Optional: gate behind a setting `markdown-editor.wordCount` (boolean, default true),
passed through `options` like the others. Rebuild the webview.

**Risk:** none. Pure Vditor option.

---

## 2. Security hardening  🟢 fixes a real exposure / better than current

> **Source:** nebuk89 — "restrict filesystem access, sanitize CSS, protect logging".

### 2a. Narrow `localResourceRoots` (the important one)
Today (`extension.ts:143-161`):
```ts
static getFolders(): vscode.Uri[] {            // A:/ … Z:/  (all drives)
  for (let i = 65; i <= 90; i++) data.push(vscode.Uri.file(`${String.fromCharCode(i)}:/`))
}
localResourceRoots: [vscode.Uri.file("/"), ...this.getFolders()]   // ← whole filesystem
```
The webview can load resources from the **entire filesystem** (`/` + every Windows drive).
That's far broader than needed and a real exposure for a webview that renders untrusted
Markdown/images.

Plan: scope to only what the editor actually needs:
- the extension's `media` dir (`extensionUri`),
- the document's **workspace folder** (or the document's own directory if no workspace),
- the configured image folder if it resolves outside the above.

```ts
const roots = [vscode.Uri.joinPath(this._context.extensionUri, 'media')]
const ws = vscode.workspace.getWorkspaceFolder(document.uri)
roots.push(ws ? ws.uri : vscode.Uri.file(NodePath.dirname(document.uri.fsPath)))
// localResourceRoots: roots
```
Make `getWebviewOptions` take the document URI so it can compute these. Drop
`Uri.file("/")` and `getFolders()`. ⚠️ Verify images still load (the base href and
`asWebviewUri` paths in `_getHtmlForWebview` must fall under a root).

### 2b. Sanitize `customCss` injection
Today (`extension.ts:563`): `config.get('customCss')` is injected **raw** into a
`<style>` block. A `</style>` inside the value closes the tag and turns following text
into live HTML → script-injection vector.
Plan: strip `</style` (case-insensitive) from the value before injection; optionally also
neutralize `javascript:`/`expression(`/`@import url(...)` to remote origins. Apply the
same to `externalCssFiles` if/when that lands (aqz236 plan §2).

### 2c. Add a Content-Security-Policy
`_getHtmlForWebview` emits no CSP `<meta>`. Add one scoped to `webview.cspSource`
(styles/scripts/img/font from the webview origin + `data:` for images), with a nonce on
our `<script>` tags. This is the standard VS Code webview hardening and pairs with 2a.

### 2d. Protect logging
`debug()` (`extension.ts:18`) and `console.log('msg', msg)` (`main.ts:27`) log full
message payloads — i.e. **document content** — to the console. Gate them behind a debug
flag (e.g. a `markdown-editor.debug` setting or `process.env`) and never log raw content
by default.

**Risk:** medium — 2a can break resource loading if scoped too tightly; test images,
custom CSS, and the vditor assets after narrowing. 2b/2c/2d are low risk.

---

## 3. Table-panel fix: `contentEditable=false` + `userSelect=none`  🟢 deeper fix

> **Source:** Inferno214221 — `tablePanel.contentEditable = "false"; tablePanel.style.userSelect = "none"`.

The IR table panel is appended **into the contenteditable IR element**
(`fix-table-ir.ts:30`, `eventRoot.appendChild(tablePanel)`). So the panel's markup is
part of the editable surface. Our current `mousedown → preventDefault`
(`fix-table-ir.ts:104`) stops the caret being stolen on click, but the panel subtree is
still editable/selectable.

Plan: in `insertTablePanel()`, after creating the wrapper, also set:
```ts
tablePanel.contentEditable = 'false'        // exclude subtree from the editable region
tablePanel.style.userSelect = 'none'
```
This is **complementary** to the existing `preventDefault`, not a replacement — keep both.
(Our positioning via `getBoundingClientRect` for `left`/`top`, `fix-table-ir.ts:133-145`,
is already more complete than Inferno's static `paddingLeft`; no change there.)

**Risk:** low. Verify the icon buttons still receive clicks (they should — `contentEditable=false`
doesn't block click events) and the table hotkeys still fire.

---

## 4. Heading-level indicators in IR mode (CSS)  🟡 cosmetic

> **Source:** Inferno214221 — `Fixes codeblocks and heading level indicators`: vertical
> centering of the `::before` level markers (H1…H6) Vditor renders in IR mode.

**`media-src/src/main.css`** — only if you actually see misaligned heading markers in IR:
```css
.vditor-ir .vditor-reset > h1 { position: relative; }
.vditor-ir .vditor-reset > h1::before {
  position: absolute;
  top: calc(50% - 4.175px);     /* account for the heading underline */
  transform: translateY(-50%);
}
/* repeat for h2…h6 as needed */
```
**Risk:** none (pure CSS). Skip if your IR headings already look fine.

---

## 5. Code-block styling in dark theme (CSS + hljs)  🟡 cosmetic

> **Source:** Inferno214221 — `hljs: { style: 'github-dark' }` + dark code-block padding fix.

We currently set `hljs.style: 'atom-one-dark-reasonable'` only in the dark branch
(`main.ts:38-40`). Optional changes:
- switch the dark hljs style to `github-dark` (taste — compare both),
- in `main.css`, fix dark code-block preview padding:
  ```css
  .vditor--dark .vditor-reset pre.vditor-ir__preview code { padding-bottom: 9.9px; }
  ```
**Risk:** none. Purely visual; adopt only if you prefer the look.

---

## Order
1. **#1 word count** — one line, do first.
2. **#3 table-panel** — small, complements an existing fix, low risk.
3. **#2 security** — the substantive one; 2a (localResourceRoots) is the priority, test
   resource loading carefully. 2b/2c/2d are quick add-ons.
4. **#4 / #5** — cosmetic CSS, adopt only if the current rendering bothers you.

#1, #3, #4, #5 need a webview rebuild (`foy build`); #2 is extension-side (2a/2b/2c/2d)
plus the CSP touches `_getHtmlForWebview`.
