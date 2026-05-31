# Task: Code-block line numbers (configurable)

> **Status:** ✅ Done.
> **Source:** `vincent-zheng/vscode-markdown-editor` — hard-coded `preview.hljs.lineNumber: true`
> **Derived from (removed plan):** `rename-tracking-and-line-numbers-plan.md` Part A
> **Value / Risk:** 🟢 low / low (purely additive)

## Goal
User toggles line numbers in fenced code blocks via a setting. Default `false` —
zero behavior change for existing users.

## Steps
1. `package.json` → `contributes.configuration.properties`:
   ```jsonc
   "markdown-editor.codeBlockLineNumbers": {
     "type": "boolean",
     "default": false,
     "description": "Show line numbers in fenced code blocks."
   }
   ```
2. `src/extension.ts` → pass to webview in the `ready` handler `options:` block
   (~`extension.ts:318`):
   ```ts
   codeBlockLineNumbers: MarkdownEditorProvider.config.get<boolean>('codeBlockLineNumbers'),
   ```
3. `media-src/src/main.ts` → wire into Vditor after the dark-theme merge
   (~`main.ts:44`), using `deepMerge` so `hljs.style` is not overwritten:
   ```ts
   if (msg.options && msg.options.codeBlockLineNumbers) {
     defaultOptions = deepMerge(defaultOptions, {
       preview: { hljs: { lineNumber: true } },
     })
   }
   ```
4. Rebuild the webview (`foy build` / esbuild).

## Notes
Line numbers apply to the rendered code **preview** only; the editing view of a
block won't show them (normal Vditor behavior).

## Verify
Enable the setting → reopen a file with a fenced code block → line numbers show.
