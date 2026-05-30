# Task: External CSS files + live reload

> **Source:** `aqz236/vscode-markdown-editor` — §2
> **Derived from (removed plan):** `aqz236-port-plan.md`
> **Value / Risk:** 🟡 medium / low (CSP + `localResourceRoots` are the only gotchas)

## Goal
Let users point to external CSS files that load into the webview and reload live on
change. We already inject `customCss` in `_getHtmlForWebview` (`extension.ts:563`).

## Steps
1. `package.json` → settings:
   - `markdown-editor.externalCssFiles` (array<string>)
   - `markdown-editor.cssLoadOrder` (enum `external-first` | `custom-first`, default `external-first`)
2. `src/extension.ts` → in `_getHtmlForWebview`, read each external file, order per
   `cssLoadOrder`, emit `<style>`/`<link>` tags (use `asWebviewUri` for file links;
   verify `localResourceRoots` covers their dirs).
3. Live reload: `createFileSystemWatcher` over the listed files → on change re-read
   and `postMessage({ command: 'reload-css', css })`; the webview swaps a dedicated
   `<style id="external-css">` node. Dispose the watcher in `onDidDispose`.

## See also
- `19-security-hardening.md` — apply the same CSS sanitization to external files.

## Verify
Configure an external CSS file → styles apply; editing the file updates the editor
live without reopening.
