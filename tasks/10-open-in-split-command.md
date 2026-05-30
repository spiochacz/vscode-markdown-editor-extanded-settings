# Task: Open in Split command

> **Source:** `aqz236/vscode-markdown-editor` — §4b
> **Derived from (removed plan):** `aqz236-port-plan.md`
> **Value / Risk:** 🟡 low / low (optional)

## Goal
`markdown-editor.openInSplit` — open the editor (or the source) in
`ViewColumn.Beside`.

## Steps
1. We already have `openEditor`/`openTextEditor` using `vscode.openWith`. Add a
   variant passing `{ viewColumn: vscode.ViewColumn.Beside }`.
2. Register the command in `package.json` and add a keybinding/menu entry.

> ⚠️ Do **not** copy aqz236's dual registration (`priority: default` + `option`).
> We deliberately register as `option` only (cleaner true-default-editor).

## Verify
Run the command → editor/source opens beside the current view.
