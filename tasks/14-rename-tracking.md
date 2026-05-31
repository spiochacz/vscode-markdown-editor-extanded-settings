# Task: Rename tracking (onDidRenameFiles)

> **Status:** ✅ Done.
> **Source:** `vincent-zheng/vscode-markdown-editor`, commit `b5721dbb` (adapted to
> our `CustomTextEditorProvider`)
> **Derived from (removed plan):** `rename-tracking-and-line-numbers-plan.md` Part B
> **Value / Risk:** medium / regression risk (touches core sync logic)

## Problem
The provider captures state at open time. After renaming an open file: stale tab
title (`fsPath` frozen, `extension.ts:185,300`), `fileWatcher` watches the old path,
`getAssetsFolder` computed from the old path, edits target the old URI, and worst:
`onDidCloseTextDocument` on the old URI may fire `webviewPanel.dispose()`.

## Steps
**B1. Mutable identity** — at the start of `resolveCustomTextEditor`:
```ts
let activeUri = document.uri
let activeFsPath = document.uri.fsPath
```
Replace `document.uri.toString()` comparisons (lines 266, 285, 291, 297) and
`fsPath` reads (185, 300, 396, 424) with `activeUri`/`activeFsPath`. Edits:
`edit.replace(activeUri, …)`.

**B2. Extract file-watcher creation** — turn the `if (workspaceFolder) {…}` block
(`extension.ts:245-262`) into `setupFileWatcher(uri)` returning a disposable held in
a variable, so it can be disposed and recreated.

**B3. Rename listener**
```ts
disposables.push(vscode.workspace.onDidRenameFiles((e) => {
  const hit = e.files.find(f => f.oldUri.toString() === activeUri.toString())
  if (!hit) return
  suppressCloseDispose = true
  activeUri = hit.newUri; activeFsPath = hit.newUri.fsPath
  webviewPanel.title = NodePath.basename(activeFsPath)
  oldWatcher?.dispose(); oldWatcher = setupFileWatcher(activeUri)
  setTimeout(() => { suppressCloseDispose = false }, 0)
}))
```

**B4. Guard the close handler** — `onDidCloseTextDocument` (`extension.ts:290`):
```ts
if (suppressCloseDispose) return
if (closedDocument.uri.toString() !== activeUri.toString()) return
webviewPanel.dispose()
```

**B5. Wiki context (optional)** — `wiki` is computed once at startup; a rename
into/out of a wiki folder won't update it. Leave as a known limitation for now.

## Notes / limitations
- Renaming a **parent folder** reports the folder's `oldUri`, not the file's. Phase
  1 covers **direct file rename only**; add folder-prefix handling later if needed.

## See also
- `21-backend-tests-vitest.md` — this becomes unit-testable: feed a fake
  `onDidRenameFiles` event into the mock and assert re-bind + close guard.

## Verify
Extension Development Host: open a file → rename in Explorer → confirm (a) tab
survives, (b) title changed, (c) edits save to the new file, (d) external changes
still flow back. No automated test (VS Code API layer).
