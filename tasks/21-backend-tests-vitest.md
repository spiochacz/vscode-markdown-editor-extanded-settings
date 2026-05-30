# Task: Backend tests — vitest + vscode-mock

> **Source:** `masterofarbs-audiodub/better-markdown-editor` — §5 (SELECTED)
> **Derived from (removed plan):** `better-markdown-editor-port-plan.md`
> **Value / Risk:** 🟢 covers untested `extension.ts` / low-medium

## Runner decision
better-markdown-editor's suite assumes **vitest** (`vscode-mock.ts` imports `vi`).
We run **node:test (unit) + Playwright (e2e)**. **Adopt vitest and consolidate** —
move our few `node:test` unit files (utils, debounce, deep-merge, format-timestamp)
into vitest. End state: **vitest (all unit) + Playwright (e2e)** — two runners.
Add `vitest`, `jsdom` devDeps + `test/vitest.config.ts`.

## Portability of their files
| File | Portability |
|---|---|
| `test/backend/vscode-mock.ts` (3.6 KB) | 🟢 Copy + extend. Add surfaces our provider touches: `tabGroups`, `onDidRenameFiles`, `createFileSystemWatcher`, `RelativePattern`, `TabInputText/Custom`. |
| `test/backend/manifest.test.ts` (2.3 KB) | 🟢 Copy almost as-is. Adjust to viewType `markdown-editor.editor` + our settings. Highest value / lowest cost. |
| `test/backend/webview-html.test.ts` (4.1 KB) | 🟡 Rewrite against our `_getHtmlForWebview` (base href, CSP, vditor icon script, customCss). |
| `test/backend/extension.test.ts` (11.7 KB) | 🔴 Rewrite from scratch for `resolveCustomTextEditor`: two-way sync guards (`applyingWebviewEdit`, `pendingWebviewContent`, `lastSyncedContent`), `ready`/`edit`/`save`, wiki init. |
| `test/backend/dispose.test.ts` (5.1 KB) | 🔴 Rewrite. Our equivalent: `onDidDispose` clears `textEditTimer` + drains `disposables` (`extension.ts:499-507`). |

## Steps
1. Add `vitest` + `jsdom` devDeps, `test/vitest.config.ts`, `test`/`test:watch` scripts.
2. Copy + extend `vscode-mock.ts` for our provider's API surface.
3. Copy `manifest.test.ts`, adapt (quick win).
4. Migrate existing `node:test` unit files to vitest (consolidate).
5. Write new `extension`/`dispose` tests against `MarkdownEditorProvider` (+ rename).
6. Keep Playwright e2e untouched.

## See also
- `14-rename-tracking.md` — directly unit-testable here (fake `onDidRenameFiles`).
- `20-tree-shake-vditor-source-import.md` — take `test/perf/bundle-size.test.ts` with it.

## Verify
`npm test` (vitest) green; existing e2e untouched and passing.
