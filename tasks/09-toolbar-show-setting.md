# Task: Toolbar hide setting (showToolbar)

> **Source:** `aqz236/vscode-markdown-editor` — §4a
> **Derived from (removed plan):** `aqz236-port-plan.md`
> **Value / Risk:** 🟡 low / low (optional)

## Goal
`markdown-editor.showToolbar` (boolean, default true). When false, render the
editor without (or with a minimal) toolbar.

## Steps
1. `package.json` → add `markdown-editor.showToolbar` (boolean, default true).
2. Pass through `options` to the webview.
3. `media-src/src/main.ts` → when false, pass an empty/minimal `toolbar` to Vditor
   (we build it via `createToolbar`).
4. Rebuild the webview (`foy build`).

## Verify
Setting false → editor opens without the toolbar; true → toolbar present.
