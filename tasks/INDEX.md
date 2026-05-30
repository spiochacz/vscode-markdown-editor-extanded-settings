# Tasks — fork analysis backlog

Atomic, independently-actionable tasks. One file = one task. Ordered roughly
quick-wins → larger features.

These tasks are the **single source of truth** — the original per-fork analysis
plans were consolidated into them and removed. Each file is self-contained (source
fork, goal, steps with file refs, verification); the `> Source:` line names the
upstream fork the task derives from.

## Quick wins (low risk, fast)
- [ ] [01 — Search Ctrl+F keybinding](01-search-keybinding.md) — 🟢 manifest only, no rebuild
- [ ] [02 — Word count](02-word-count.md) — 🟢 one Vditor option
- [ ] [03 — Code-block line numbers (setting)](03-codeblock-line-numbers-setting.md) — 🟢 additive
- [ ] [04 — IR heading-level indicator CSS](04-ir-heading-level-indicator-css.md) — 🟡 cosmetic
- [ ] [05 — Code-block dark-theme CSS](05-codeblock-dark-theme-css.md) — 🟡 cosmetic
- [ ] [06 — Table-panel contentEditable fix](06-table-panel-contenteditable-fix.md) — 🟢 small

## Settings & polish
- [ ] [07 — highlightHeadings + outlinePosition](07-settings-highlight-headings-outline-position.md)
- [ ] [08 — outlineWidth + showOutlineByDefault](08-outline-width-show-by-default.md)
- [ ] [09 — Toolbar hide setting](09-toolbar-show-setting.md)
- [ ] [10 — Open in Split command](10-open-in-split-command.md)
- [ ] [11 — Perf: debounce + drop onLanguage](11-perf-debounce-activation.md)
- [ ] [12 — External CSS files + live reload](12-external-css-live-reload.md)

## Features
- [ ] [13 — Outline navigation + heading flash](13-outline-heading-flash.md)
- [ ] [14 — Rename tracking (onDidRenameFiles)](14-rename-tracking.md)
- [ ] [15 — Shared DOM→source mapping](15-shared-dom-source-mapping.md) — prerequisite for 16 & 17
- [ ] [16 — Reveal-in-Source](16-reveal-in-source.md) — needs 15
- [ ] [17 — Git gutters](17-git-gutters.md) — needs 15
- [ ] [22 — Image resize (drag handles)](22-image-resize.md) — spike first
- [ ] [23 — Wikilinks resolution](23-wikilinks-resolution.md)

## Security
- [ ] [18 — Security hardening (fs / CSS / CSP / logging)](18-security-hardening.md) — 2a is the priority

## Infra / refactor
- [x] [19 — Replace user-event with native keyboard](19-replace-user-event-native-keyboard.md) — ✅ done in 0.2.33
- [ ] [20 — Tree-shake Vditor source import](20-tree-shake-vditor-source-import.md) — separate branch
- [ ] [21 — Backend tests (vitest + vscode-mock)](21-backend-tests-vitest.md)
- [ ] [24 — Proper CI/CD pipeline](24-ci-cd-pipeline.md) — PR test gate; one release path; deliberate version bump

## Dependencies between tasks
- **15 → 16, 17** — build the shared mapping module first.
- **07 / 08 / 13** — all touch the same outline panel; implement the panel config once.
- **12 ↔ 18 (2b)** — apply CSS sanitization to external CSS too.
- **14 → 21** — rename tracking becomes unit-testable once the vscode mock exists.
- **20 → 21** — `bundle-size.test.ts` ships with the tree-shake work.

## Not split out (decisions carried over from the analysis)
- **aqz236 §5 (bun / i18n / restructure)** — "not a standalone task"; fold in
  organically. Skip bun (conflicts with task 20's esbuild `build.mjs`).
- **aqz236 §3 outline / better-md §2 outlinePosition** — merged into tasks 07 + 08.
