# Task: Table-panel fix — contentEditable=false + userSelect=none

> **Source:** `Inferno214221/vscode-markdown-editor` — quick-fixes §3
> **Derived from (removed plan):** `quick-fixes-and-hardening-plan.md`
> **Value / Risk:** 🟢 deeper fix / low

## Goal
The IR table panel is appended **into the contenteditable IR element**
(`fix-table-ir.ts:30`, `eventRoot.appendChild(tablePanel)`), so its markup is part
of the editable surface. Our current `mousedown → preventDefault`
(`fix-table-ir.ts:104`) stops caret stealing on click, but the panel subtree is
still editable/selectable. Exclude it from the editable region.

## Steps
1. `media-src/src/fix-table-ir.ts` → in `insertTablePanel()`, after creating the
   wrapper, also set:
   ```ts
   tablePanel.contentEditable = 'false'   // exclude subtree from editable region
   tablePanel.style.userSelect = 'none'
   ```
   This is **complementary** to the existing `preventDefault` — keep both. No change
   to positioning (`getBoundingClientRect`, `fix-table-ir.ts:133-145`).
2. Rebuild the webview (`foy build`).

## Verify
Icon buttons still receive clicks (`contentEditable=false` doesn't block click
events) and table hotkeys still fire; the panel is no longer selectable.
