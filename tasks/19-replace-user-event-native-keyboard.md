# Task: Replace @testing-library/user-event with native keyboard dispatch

> **Source:** internal design (dependency cleanup #4 after jQuery, jquery-confirm, lodash, date-fns)
> **Derived from (removed plan):** `drop-user-event-native-keyboard-design.md`
> **Value / Risk:** 🟢 drops 3 runtime deps / refactor of working behavior (TDD-guarded)
> **Status:** ✅ Implemented in 0.2.33 — `media-src/src/table-hotkey.ts`, `media-src/e2e/`,
> deps removed (see CHANGELOG). Retained here as provenance/reference.

## Goal
`fix-table-ir.ts` uses `@testing-library/user-event`'s `keyboard()` at **runtime**
to fire Vditor table hotkeys — a testing lib shipped in production. Replace with a
~15-line native `KeyboardEvent` dispatcher and drop three runtime deps.

## Key fact
Vditor's `matchHotKey` reads `event.key` (case-insensitive) + `shiftKey/altKey` +
`isCtrl` (ctrl OR meta). It does **not** use `event.code`, so no key-code map needed.

## Implementation
New module `media-src/src/table-hotkey.ts`:

**`resolveShortcut(type, isMac)` — pure**, reproducing the current `handleMap`:
```ts
const SHORTCUTS = {
  left:{key:'l',shift:true}, center:{key:'c',shift:true}, right:{key:'r',shift:true},
  insertRowA:{key:'f',shift:true}, insertRowB:{key:'=',shift:false}, deleteRow:{key:'-',shift:false},
  insertColumnL:{key:'g',shift:true},
  insertColumnR:{key:'+',macKey:'=',shift:true}, deleteColumn:{key:'_',macKey:'-',shift:true},
}
// -> { key: isMac && s.macKey ? s.macKey : s.key, shift: s.shift }
```
**`dispatchTableHotkey(el, type, isMac)` — thin DOM shell** (keydown only):
```ts
const { key, shift } = resolveShortcut(type, isMac)
el.dispatchEvent(new KeyboardEvent('keydown', {
  key, shiftKey: shift, ctrlKey: !isMac, metaKey: isMac, bubbles: true, cancelable: true,
}))
```
**`fix-table-ir.ts`:** remove `handleMap` + the `keyboard()` call; in the icon-click
handler call `dispatchTableHotkey(eventRoot, type, isMac)`. Preserve
`disableVscodeHotkeys` (set true → dispatch sync → reset in `finally`; no Promise).
Remove the dead `import { keyboard }` from `utils.ts`.

## Dependency changes
- Remove from `media-src` runtime deps: `@testing-library/user-event`,
  `@testing-library/dom`, `@babel/runtime-corejs3`.
- Add devDep: `@playwright/test`.

## Testing — Playwright e2e (TDD, refactor-safe)
Write the 9-action e2e suite against the **current** `keyboard()` code, confirm
green, then swap to the native dispatcher and confirm still green. Harness in `e2e/`
builds a Vditor IR editor with a known table and exposes `window.vditorTest`.

## Verify
`npm test` + `npm run test:e2e` green → esbuild build → confirm none of the three
libs remain in `media/dist/main.js` → manual sanity in VS Code (IR mode, click table
icons).
