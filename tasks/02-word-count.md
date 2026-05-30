# Task: Word count (Vditor counter)

> **Source:** `Inferno214221/vscode-markdown-editor` — quick-fixes §1
> **Derived from (removed plan):** `quick-fixes-and-hardening-plan.md`
> **Value / Risk:** 🟢 trivial / none (pure Vditor option)

## Goal
Show a live word/char count via Vditor's built-in counter.

## Steps
1. `media-src/src/main.ts` → add to the `new Vditor('app', { … })` options
   (near `cache`, `toolbarConfig`, ~`main.ts:62`):
   ```ts
   counter: { enable: true },          // built-in live word/char counter
   ```
2. Optional: gate behind setting `markdown-editor.wordCount` (boolean, default
   true), passed through `options` like the others.
3. Rebuild the webview (`foy build`).

## Verify
Open a file → live word/char count is visible.
