# Task: Search Ctrl+F / Cmd+F keybinding

> **Status:** ✅ Done.
> **Source:** `masterofarbs-audiodub/better-markdown-editor` — §1
> **Derived from (removed plan):** `better-markdown-editor-port-plan.md`
> **Value / Risk:** 🟢 high / none (pure manifest change, no rebuild)

## Goal
Trigger VS Code's built-in find widget inside the custom editor. Half the work is
already done — `enableFindWidget: true` is set (`extension.ts:128`); only the
keybinding is missing.

## Steps
1. `package.json` → add to `contributes.keybindings` (next to existing `ctrl+alt+e`):
   ```jsonc
   {
     "key": "ctrl+f",
     "command": "editor.action.webvieweditor.showFind",
     "mac": "cmd+f",
     "when": "activeCustomEditorId == markdown-editor.editor"
   }
   ```
   Keep the same unquoted `when` viewType style as the existing keybinding.

## Verify
Open a file in the editor, press Ctrl+F → the find widget appears. No webview
rebuild needed.
