# Task: Perf — raise debounce + drop onLanguage activation

> **Status:** ✅ Done.
> **Source:** `masterofarbs-audiodub/better-markdown-editor` — §3
> **Derived from (removed plan):** `better-markdown-editor-port-plan.md`
> **Value / Risk:** 🟡 medium / low

## Goal
Fewer `applyEdit` calls (edit debounce 100→250 ms) and faster startup (drop eager
`onLanguage:markdown` activation).

## Steps
1. `package.json` → remove `onLanguage:markdown` from `activationEvents`.
   Remaining: `onCommand:markdown-editor.openEditor`,
   `onCommand:markdown-editor.openTextEditor`,
   `onCustomEditor:markdown-editor.editor` (the custom editor activates on opening
   a `.md` anyway, so `onLanguage` is redundant).
2. `media-src/src/main.ts:101` → `input()` debounce `100` → `250`.
3. (Optional) `extension.ts` `schedulePostUpdate` uses 75 ms (file→webview, other
   direction) — leave it or raise slightly; less critical.
4. Rebuild the webview (`foy build`).

## Verify
⚠️ After raising the debounce, confirm fast typing + immediate Ctrl+S does **not**
drop the last characters (save must flush the pending edit).
