# Marp Preview Integration (rework) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the Marp slide deck inside Vditor's NATIVE preview surface — the SPLIT-mode right pane AND the "Preview" toolbar button in IR/WYSIWYG — instead of a separate right panel. Remove the standalone panel; retarget caret↔slide sync onto the deck in the preview.

**Architecture:** Vditor renders its preview in ONE place (`preview/index.ts`, `let html = vditor.lute.Md2HTML(markdownText)`), shared by the sv right pane (`sv/process.ts:113 → preview.render`) and the IR/WYSIWYG Preview button (`toolbar/Preview.ts:45 → preview.render`). An esbuild source patch gates that call through `window.__vmarkdRenderMarpPreview(markdownText)`: for a `marp:true` doc it returns the Marp deck HTML (+ scoped CSS), else `null` → normal Lute render. One seam covers all three preview surfaces. The deck lives in `.vditor-preview`'s `.vditor-reset`; the standalone panel is deleted.

**Tech Stack:** TypeScript, esbuild (webview bundle + Vditor-source onLoad patches in `media-src/esbuild-shared.mjs`), Vitest (backend), Playwright (`media-src/e2e`). Plain node + npm.

---

## Context the engineer needs

This is a REWORK of an already-shipped feature (Marp Phase 1, commits `8ca6ead`..`118c253` on branch `feat/marp-presentation`). Read `docs/superpowers/plans/2026-06-13-marp-presentation-phase1.md` "Context" section first for repo conventions. Key facts for THIS plan:

- **Two editor preview entry points, ONE render function.** `media-src/node_modules/vditor/src/ts/preview/index.ts` `Preview.render(vditor, value?)` does `const markdownText = getMarkdown(vditor)` then `let html = vditor.lute.Md2HTML(markdownText); … this.previewElement.innerHTML = html`. The string `let html = vditor.lute.Md2HTML(markdownText);` occurs TWICE (line ~185 in the `preview.url` error-fallback branch, line ~197 in the default local path). vMarkd sets neither `preview.url` nor `preview.transform`, so the default path (197) is the live one; patch BOTH with `replaceAll` for safety. `this.previewElement` is the inner `.vditor-reset`; `this.element` is the outer `.vditor-preview`.
- **The preview is shared:** `sv/process.ts:113` calls `vditor.preview.render(vditor)` on input (sv right pane); `toolbar/Preview.ts:45` calls it when the Preview button toggles on (IR/WYSIWYG). Patching `render` covers all three.
- **esbuild Vditor-source patch pattern:** `media-src/esbuild-shared.mjs` has many `onLoad` plugins (e.g. `fixPreviewCopyTip` already patches `preview/index.ts`; `fixMathRender`). Each: a `patchX(code)` that asserts an anchor (throws on drift) + a plugin registered in the `vditorSourceConfig.plugins` array. Add `fixMarpPreview` the same way.
- **CSP:** `script-src` allows `${cspSource}` so the runtime-injected chunk `<script>` loads (already proven by Phase 1). `style-src 'unsafe-inline'` allows the deck CSS.
- **Async wrinkle:** `Preview.render` is synchronous; `loadMarp()` (chunk load) is async. On the FIRST marp render the chunk may not be loaded, so `__vmarkdRenderMarpPreview` can't return the deck synchronously. Handle: kick off `loadMarp()`, return a placeholder string, and on load call `window.vditor.preview.render(window.vditor)` to repaint. After first load the chunk is cached (`window.__vmarkdMarp` exists) → synchronous.
- **Reusable from Phase 1 (KEEP):** `src/marp-detect.ts` (`parseMarpEnabled`), `media-src/src/marp-entry.ts` + the `media/dist/marp.js` chunk, `media-src/src/marp-preview.ts` (`loadMarp`, `MarpApi`), `media-src/src/marp-slide-overlay.ts` (editor card overlay — orthogonal to the preview, stays).
- **Being removed:** `media-src/src/marp-panel.ts` (standalone right panel + splitter) and all its wiring.
- **rtk:** use `rtk proxy <cmd>` for raw grep/test/build output. Build = `node build.mjs`. Lint = `npm run lint:ci`. e2e = `cd media-src && rtk proxy npx playwright test <spec>`. Backend = `rtk proxy npx vitest run --config test/vitest.config.ts`. Do NOT push/PR/merge.

### File Structure (this plan)

| File | Action | Responsibility |
|---|---|---|
| `media-src/esbuild-shared.mjs` | modify | Add `fixMarpPreview` plugin: gate `Md2HTML(markdownText)` through `window.__vmarkdRenderMarpPreview`. |
| `media-src/src/marp-slide-map.ts` | create | Pure slide↔source map (`slideIndexForOffset`/`offsetForSlideIndex`/`frontmatterStartLine`/`charOffsetOfLine`), extracted from marp-panel.ts. |
| `test/backend/marp-slide-map.test.ts` | create | Unit tests for the map (incl. monotonicity across `---` + frontmatter skip). |
| `media-src/src/marp-preview.ts` | modify | Add `renderMarpPreview(source, marp)` → the `<style>+deck` HTML string (reusing render). Keep `loadMarp`/`MarpApi`. |
| `media-src/src/marp-preview-intercept.ts` | create | `installMarpPreview()`: sets `window.__vmarkdRenderMarpPreview`; sync-if-loaded, async-load+repaint, placeholder. Plus deck sync: caret→active-slide highlight + click→`__vmarkdMarpNav`, targeting `.vditor-preview` sections. |
| `media-src/src/main.ts` | modify | Remove all marp-panel wiring; install the preview intercept; retarget the caret forward-sync to call the intercept's highlight. Keep the overlay mount. |
| `media-src/src/main.css` | modify | Remove `.vmarkd-marp__wrapper/__panel/__splitter/__header/__toggle/__panelbody/collapsed/resizing` rules; keep `.vmarkd-marp__deck`/error + `.vmarkd-marp__active` (retarget active to `.vditor-preview` sections). |
| `media-src/src/marp-panel.ts` | DELETE | Standalone panel removed. |
| `media-src/e2e/marp-harness.ts`, `marp.html`, `marp.spec.ts` | modify | Drop panel-mount tests; add render-string + sync tests against a simulated `.vditor-preview`. |
| `CHANGELOG.md`, `tasks/107-marp-slide-preview.md` | modify | Update the entry (deck renders in the native preview, not a side panel). |

---

## Task R1: esbuild patch + pure slide-map extraction

**Files:** modify `media-src/esbuild-shared.mjs`; create `media-src/src/marp-slide-map.ts` + `test/backend/marp-slide-map.test.ts`; modify `media-src/src/marp-panel.ts` (temporarily import the moved helpers so the build stays green until R2 deletes it).

- [ ] **Step 1: Extract the pure map helpers — write the failing test**

Create `test/backend/marp-slide-map.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { slideIndexForOffset, offsetForSlideIndex } from '../../media-src/src/marp-slide-map'

const DECK = '---\nmarp: true\n---\n\n# A\n\n---\n\n# B\n\n---\n\n# C\n'

describe('slideIndexForOffset', () => {
  it('offset 0 (start, inside frontmatter region) is slide 0', () => {
    expect(slideIndexForOffset(DECK, 0)).toBe(0)
  })
  it('frontmatter closing --- is NOT a slide break', () => {
    // offset just after the frontmatter close, in "# A" → still slide 0
    const aIdx = DECK.indexOf('# A')
    expect(slideIndexForOffset(DECK, aIdx)).toBe(0)
  })
  it('counts top-level --- before the offset', () => {
    expect(slideIndexForOffset(DECK, DECK.indexOf('# B'))).toBe(1)
    expect(slideIndexForOffset(DECK, DECK.indexOf('# C'))).toBe(2)
  })
  it('is monotonic across a --- boundary (never flips up then down)', () => {
    let prev = -1
    for (let o = 0; o <= DECK.length; o++) {
      const idx = slideIndexForOffset(DECK, o)
      expect(idx).toBeGreaterThanOrEqual(prev)
      prev = idx
    }
  })
})

describe('offsetForSlideIndex', () => {
  it('index 0 → start of first slide content (after frontmatter)', () => {
    expect(offsetForSlideIndex(DECK, 0)).toBe(DECK.indexOf('# A'))
  })
  it('index K → start of the Kth slide content', () => {
    expect(offsetForSlideIndex(DECK, 1)).toBe(DECK.indexOf('# B'))
    expect(offsetForSlideIndex(DECK, 2)).toBe(DECK.indexOf('# C'))
  })
})
```

- [ ] **Step 2: Run it — fails (module missing)**

Run: `rtk proxy npx vitest run --config test/vitest.config.ts test/backend/marp-slide-map.test.ts`
Expected: FAIL — cannot find `marp-slide-map`.

- [ ] **Step 3: Create `marp-slide-map.ts` with the helpers**

Move the current helpers out of `media-src/src/marp-panel.ts` verbatim (they were hardened in Phase 1) into `media-src/src/marp-slide-map.ts`:
```ts
// Pure slide↔source map (task 107). Counts top-level `---` slide-break lines, skipping a leading
// YAML frontmatter block. Shared by the preview-deck sync (caret→slide + click→source). Assumes
// LF line endings (the editor source is LF). Monotonic: frontmatter end is computed from the FULL
// source and breaks are compared by line-start offset, so the index never flips across a boundary.

/** First content line AFTER a leading `--- … ---`/`...` frontmatter block; 0 when none. */
export function frontmatterStartLine(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0
  for (let k = 1; k < lines.length; k++) {
    if (/^(---|\.\.\.)\s*$/.test(lines[k])) return k + 1
  }
  return 0
}

export function slideIndexForOffset(source: string, offset: number): number {
  const lines = source.split(/\r?\n/)
  const start = frontmatterStartLine(lines)
  const clamped = Math.max(0, offset)
  let slide = 0
  let pos = 0
  for (let i = 0; i < lines.length; i++) {
    if (i >= start && lines[i].trim() === '---' && pos < clamped) slide++
    pos += lines[i].length + 1
  }
  return slide
}

export function offsetForSlideIndex(source: string, index: number): number {
  const lines = source.split(/\r?\n/)
  const start = frontmatterStartLine(lines)
  if (index <= 0) return charOffsetOfLine(lines, start)
  let slide = 0
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      slide++
      if (slide === index) return charOffsetOfLine(lines, i + 1)
    }
  }
  return charOffsetOfLine(lines, lines.length)
}

// Assumes LF line endings (`+1` per line for the stripped `\n`); the editor source is LF.
function charOffsetOfLine(lines: string[], line: number): number {
  let off = 0
  for (let i = 0; i < Math.min(line, lines.length); i++) off += lines[i].length + 1
  return off
}
```
Then in `marp-panel.ts`, DELETE the in-file copies of these four functions and add `import { slideIndexForOffset, offsetForSlideIndex } from './marp-slide-map'` so it still compiles (it's deleted entirely in R2; this keeps the build green now).

- [ ] **Step 4: Run the test — passes**

Run: `rtk proxy npx vitest run --config test/vitest.config.ts test/backend/marp-slide-map.test.ts`
Expected: PASS (6 assertions). Also `node build.mjs` must stay clean (marp-panel.ts now imports the helpers).

- [ ] **Step 5: Add the `fixMarpPreview` esbuild patch**

In `media-src/esbuild-shared.mjs`, add (near the other patch fns, before `vditorSourceConfig`):
```js
// Task 107 — Marp preview. Vditor's preview render (preview/index.ts) does
// `let html = vditor.lute.Md2HTML(markdownText)` then writes it into `.vditor-preview`. For a
// `marp: true` doc we render the Marp slide deck INSTEAD — in the same surface used by the sv
// right pane AND the IR/WYSIWYG "Preview" button. Gate the (Lute) render through a webview hook
// that returns the deck HTML for marp docs, else null → unchanged Lute render. The literal occurs
// twice (the preview.url fallback branch + the default local path); replaceAll covers both.
const MARP_PREVIEW_ANCHOR = 'let html = vditor.lute.Md2HTML(markdownText);'
export function patchMarpPreview(code) {
  if (!code.includes(MARP_PREVIEW_ANCHOR)) {
    throw new Error(
      'fixMarpPreview: anchor not found in vditor preview/index.ts (version drift?)',
    )
  }
  return code.replaceAll(
    MARP_PREVIEW_ANCHOR,
    'let html = (window.__vmarkdRenderMarpPreview ? (window.__vmarkdRenderMarpPreview(markdownText) ?? vditor.lute.Md2HTML(markdownText)) : vditor.lute.Md2HTML(markdownText));',
  )
}
const fixMarpPreview = {
  name: 'fix-marp-preview',
  setup(build) {
    build.onLoad(
      { filter: /vditor[/\\]src[/\\]ts[/\\]preview[/\\]index\.ts$/ },
      async (args) => {
        const code = await readFile(args.path, 'utf8')
        return { loader: 'ts', contents: patchMarpPreview(code) }
      },
    )
  },
}
```
Add `fixMarpPreview` to the `vditorSourceConfig.plugins` array (next to `fixPreviewCopyTip`).

> NOTE: `preview/index.ts` already has a `fixPreviewCopyTip` onLoad. esbuild runs only the FIRST matching onLoad per file — so `fixMarpPreview` and `fixPreviewCopyTip` BOTH filter `preview/index.ts` and will COLLIDE (only one runs). You MUST merge them into ONE plugin that applies both patches in sequence (mirror how `fixEcharts` applies multiple rewrites in one onLoad). Implement `fixPreviewCopyTip`'s and `fixMarpPreview`'s code transforms inside a single `onLoad` for `preview/index.ts`: `let code = await readFile(...); code = patchPreviewCopyTip(code); code = patchMarpPreview(code); return {loader:'ts', contents: code}`. Remove the standalone `fixPreviewCopyTip` plugin registration and keep its `patchPreviewCopyTip` function. Verify with a build that BOTH transforms still apply (the copy tip is English AND the marp gate is present).

- [ ] **Step 6: Build + verify the patch is present**

Run: `node build.mjs` then `rtk proxy grep -c "__vmarkdRenderMarpPreview" media/dist/main.js`
Expected: build clean; grep count ≥ 1 (the gate is bundled). Also confirm the copy-tip patch survived: `rtk proxy grep -c "Copied to clipboard" media/dist/main.js` ≥ 1.

- [ ] **Step 7: Run unit + lint + commit**

Run: `rtk proxy npx vitest run --config test/vitest.config.ts` (all pass) and `npm run lint:ci` (exit 0).
```bash
git add media-src/esbuild-shared.mjs media-src/src/marp-slide-map.ts test/backend/marp-slide-map.test.ts media-src/src/marp-panel.ts
git commit -m "feat(marp): preview-render gate (esbuild) + extract pure slide-map (task 107)"
```

---

## Task R2: the preview intercept — render the deck into Vditor's preview

**Files:** modify `media-src/src/marp-preview.ts`; create `media-src/src/marp-preview-intercept.ts`; modify `media-src/src/main.ts`; modify `media-src/e2e/{marp-harness.ts, marp.html, marp.spec.ts}`.

- [ ] **Step 1: Add `renderMarpPreview` to `marp-preview.ts`**

Append to `media-src/src/marp-preview.ts` (keep `loadMarp`/`MarpApi`/`injectDeck`):
```ts
/**
 * Render `source` to a self-contained HTML STRING for Vditor's preview surface: the scoped deck
 * CSS in a `<style>` followed by the `<div class="marpit">…` deck. Written into `.vditor-reset`
 * via Vditor's `innerHTML`. Marp scopes its theme under `.marpit`, so the `<style>` can't restyle
 * `.vditor-reset` itself. Returns '' on render error (caller falls back / shows nothing).
 */
export function renderMarpPreview(source: string, marp: MarpApi): string {
  try {
    const { html, css } = marp.render(source)
    return `<style class="vmarkd-marp__style">${css}</style>${html}`
  } catch (err) {
    return `<div class="vmarkd-marp__error">Marp render failed: ${
      (err as Error)?.message ?? err
    }</div>`
  }
}
```

- [ ] **Step 2: Write the intercept module**

Create `media-src/src/marp-preview-intercept.ts`:
```ts
// Marp preview intercept (task 107). Installs window.__vmarkdRenderMarpPreview, the gate the
// esbuild patch calls inside Vditor's preview render. For a `marp: true` doc it returns the Marp
// deck HTML (string) to drop into `.vditor-preview`; else null → Vditor's normal Lute render.
//
// Sync contract: Vditor's render is synchronous, but the marp chunk loads async. If the chunk
// isn't loaded yet we kick off loadMarp(), return a placeholder, and repaint via
// vditor.preview.render once it lands (then the chunk is cached → synchronous). Also owns the
// deck sync: caret→active-slide highlight + click→source-offset, targeting the preview's sections.
import { parseMarpEnabled } from '../../src/marp-detect'
import { loadMarp, renderMarpPreview, type MarpApi } from './marp-preview'
import { offsetForSlideIndex, slideIndexForOffset } from './marp-slide-map'

const PLACEHOLDER = '<div class="vmarkd-marp__error">Loading Marp…</div>'
let api: MarpApi | null = null

function repaint(): void {
  const v = (window as any).vditor
  // Re-run Vditor's preview render now that the chunk is loaded (synchronous this time).
  v?.vditor?.preview?.render?.(v.vditor) ?? v?.preview?.render?.(v)
}

/** Install the gate. Idempotent. */
export function installMarpPreview(): void {
  ;(window as any).__vmarkdRenderMarpPreview = (markdownText: string): string | null => {
    if (!parseMarpEnabled(markdownText)) return null
    if (api) return renderMarpPreview(markdownText, api)
    // Chunk not ready: load, then repaint. Show a placeholder this pass.
    loadMarp()
      .then((a) => {
        api = a
        repaint()
      })
      .catch(() => {
        /* leave the placeholder; load failed */
      })
    return PLACEHOLDER
  }
  installDeckSync()
}

// ── Deck sync (forward: caret→highlight; reverse: click→source offset) ──────────────────────
const PREVIEW_SEL = '.vditor-preview'
const ACTIVE = 'vmarkd-marp__active'

function previewSections(): HTMLElement[] {
  const preview = document.querySelector<HTMLElement>(PREVIEW_SEL)
  if (!preview || preview.style.display === 'none') return []
  return Array.from(preview.querySelectorAll<HTMLElement>('section'))
}

let activeIdx = -1
/** Highlight + scroll the preview deck to the slide containing `offset`. No-op if no deck shown. */
export function highlightPreviewSlide(source: string, offset: number): void {
  const sections = previewSections()
  if (!sections.length) return
  const idx = slideIndexForOffset(source, offset)
  if (idx < 0 || idx >= sections.length || idx === activeIdx) return
  sections.forEach((s, i) => s.classList.toggle(ACTIVE, i === idx))
  sections[idx].scrollIntoView({ block: 'nearest' })
  activeIdx = idx
}

function installDeckSync(): void {
  // Reverse-nav: click a slide in the preview → report its source offset. Delegated so it survives
  // the preview being re-rendered. (The host consumer of __vmarkdMarpNav is wired separately.)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null
    const section = target?.closest('section')
    const preview = target?.closest(PREVIEW_SEL)
    if (!section || !preview) return
    const sections = Array.from(preview.querySelectorAll('section'))
    const idx = sections.indexOf(section)
    if (idx < 0) return
    const src = (window as any).vditor?.getValue?.() ?? ''
    ;(window as any).__vmarkdMarpNav?.(offsetForSlideIndex(src, idx))
  })
}
```

- [ ] **Step 3: Rewire `main.ts` — install the intercept, drop the panel, retarget the caret sync**

In `media-src/src/main.ts`:
1. Remove the marp-panel import, the `let marpPanel` holder, the `marpPanel?.dispose()/mountMarpPanel(...)` block in `runFinishInit`, and `marpPanel?.update(content)` in `postEdit`. (Leave the `content` local in `postEdit`; just drop the marp line.)
2. Add `import { installMarpPreview, highlightPreviewSlide } from './marp-preview-intercept'`.
3. Install once — at the top of `initVditor` next to `__vmarkdMarpSrc`, OR in `runFinishInit`. Installing the gate is cheap and harmless for non-marp docs (it returns null), so install unconditionally:
```ts
  if (msg.marpSrc) (window as any).__vmarkdMarpSrc = msg.marpSrc
  installMarpPreview()
```
4. Retarget the forward-sync in `trackEditorCaret`: replace the `marpPanel`-based debounced block with one calling `highlightPreviewSlide`. Keep the 120ms debounce + `marpSyncTimer`:
```ts
  // Marp forward sync (task 107): highlight the caret's slide in the preview deck. Debounced —
  // getCursorSourceOffset does a full DOM→markdown round-trip. Cheap no-op when no deck is shown.
  if (marpSyncTimer) clearTimeout(marpSyncTimer)
  marpSyncTimer = setTimeout(() => {
    marpSyncTimer = null
    const off = getCursorSourceOffset(window.vditor)
    if (off >= 0) highlightPreviewSlide(window.vditor.getValue(), off)
  }, 120)
```
(Drop the `if (marpPanel)` guard — `highlightPreviewSlide` self-guards via `previewSections()` returning empty when no deck is visible. Keep the overlay mount block — `disposeMarpOverlay`/`observeSlideOverlay` — unchanged.)

- [ ] **Step 4: Build clean**

Run: `node build.mjs` — clean. `rtk proxy grep -c "marp-panel" media/dist/main.js` should be 0 (panel no longer referenced; the file is deleted in Step 6 below — but main.ts must no longer import it now).

- [ ] **Step 5: Update harness + spec to the preview model**

Rework `media-src/e2e/marp.html` to simulate the preview surface: a `.vditor-preview` containing a `.vditor-reset`, and a stub `window.vditor` whose `preview.render` writes `__vmarkdRenderMarpPreview(getValue())` (or Lute fallback) into `.vditor-reset`. Replace `media-src/e2e/marp-harness.ts` with hooks that exercise the REAL intercept:
```ts
import { installMarpPreview, highlightPreviewSlide } from '../src/marp-preview-intercept'

;(window as any).__vmarkdMarpSrc = '/marp-chunk.js'

const preview = document.querySelector('.vditor-preview') as HTMLElement
const reset = preview.querySelector('.vditor-reset') as HTMLElement
let source = ''
let lastNavOffset = -1
;(window as any).__vmarkdMarpNav = (o: number) => { lastNavOffset = o }
;(window as any).__lastNavOffset = () => lastNavOffset

// Minimal Vditor stub: preview.render writes the gate's HTML (or a Lute-ish fallback) into reset.
;(window as any).vditor = {
  getValue: () => source,
  vditor: {
    preview: {
      render() {
        const html = (window as any).__vmarkdRenderMarpPreview(source)
        reset.innerHTML = html ?? `<p>lute: ${source.length} chars</p>`
      },
    },
  },
}

installMarpPreview()

;(window as any).__setSource = (s: string) => { source = s }
;(window as any).__renderPreview = () => (window as any).vditor.vditor.preview.render()
;(window as any).__sectionCount = () => reset.querySelectorAll('section').length
;(window as any).__previewVisible = (v: boolean) => { preview.style.display = v ? 'block' : 'none' }
;(window as any).__highlight = (off: number) => highlightPreviewSlide(source, off)
;(window as any).__activeIdx = () =>
  Array.from(reset.querySelectorAll('section')).findIndex((s) =>
    (s as HTMLElement).classList.contains('vmarkd-marp__active'),
  )
;(window as any).__marpLoaded = () => !!(window as any).__vmarkdMarp
;(window as any).__ready = true
```
`marp.html` body:
```html
  <body>
    <div class="vditor-preview" style="display:block">
      <div class="vditor-reset"></div>
    </div>
    <script src="/marp.js"></script>
  </body>
```
(Keep the `serve.mjs` `marp` entry + `/marp-chunk.js` route from Phase 1.)

Rewrite `media-src/e2e/marp.spec.ts` to the new model (replace the panel-mount tests):
```ts
import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

const DECK = `---\nmarp: true\n---\n\n# One\n\n---\n\n# Two\n\n---\n\n# Three\n`
const PLAIN = `# Not a deck\n\njust text\n`

async function goto(page: Page) {
  await page.goto('/marp.html')
  await page.waitForFunction(() => (window as any).__ready === true)
}

// The first render of a marp doc shows a placeholder, then repaints with the deck once the chunk
// loads. waitFor the sections to appear.
async function renderDeck(page: Page, src: string) {
  await page.evaluate((s) => (window as any).__setSource(s), src)
  await page.evaluate(() => (window as any).__renderPreview())
  await page.waitForFunction(() => (window as any).__sectionCount() > 0)
}

test('a marp doc renders N <section> slides into the preview', async ({ page }) => {
  await goto(page)
  await renderDeck(page, DECK)
  expect(await page.evaluate(() => (window as any).__sectionCount())).toBe(3)
})

test('a non-marp doc falls back to the normal (lute) render — no sections, chunk not loaded', async ({ page }) => {
  await goto(page)
  await page.evaluate((s) => (window as any).__setSource(s), PLAIN)
  await page.evaluate(() => (window as any).__renderPreview())
  expect(await page.evaluate(() => (window as any).__sectionCount())).toBe(0)
  expect(await page.evaluate(() => (window as any).__marpLoaded())).toBe(false)
})

test('caret offset highlights the matching slide in the preview', async ({ page }) => {
  await goto(page)
  await renderDeck(page, DECK)
  await page.evaluate((o) => (window as any).__highlight(o), DECK.indexOf('# Two'))
  expect(await page.evaluate(() => (window as any).__activeIdx())).toBe(1)
})

test('clicking a slide reports its source offset', async ({ page }) => {
  await goto(page)
  await renderDeck(page, DECK)
  await page.locator('.vditor-preview section').nth(2).click()
  const off = await page.evaluate(() => (window as any).__lastNavOffset())
  expect(off).toBe(DECK.indexOf('# Three'))
})

test('highlight is a no-op when the preview is hidden', async ({ page }) => {
  await goto(page)
  await renderDeck(page, DECK)
  await page.evaluate(() => (window as any).__previewVisible(false))
  await page.evaluate((o) => (window as any).__highlight(o), DECK.indexOf('# Two'))
  expect(await page.evaluate(() => (window as any).__activeIdx())).toBe(-1)
})
```

- [ ] **Step 6: Delete the standalone panel**

```bash
git rm media-src/src/marp-panel.ts
```
Confirm nothing imports it: `rtk proxy grep -rn "marp-panel" media-src/src media-src/e2e` → no hits. `node build.mjs` clean.

- [ ] **Step 7: Run e2e + build + lint, commit**

Run: `cd media-src && rtk proxy npx playwright test marp.spec.ts` → 5/5. `node build.mjs` clean. `npm run lint:ci` exit 0.
```bash
git add media-src/src/marp-preview.ts media-src/src/marp-preview-intercept.ts media-src/src/main.ts media-src/e2e/marp-harness.ts media-src/e2e/marp.html media-src/e2e/marp.spec.ts
git commit -m "feat(marp): render deck in Vditor preview surface; drop standalone panel (task 107)"
```

---

## Task R3: CSS cleanup + docs + full regression

**Files:** modify `media-src/src/main.css`, `CHANGELOG.md`, `tasks/107-marp-slide-preview.md`.

- [ ] **Step 1: Prune panel CSS, retarget active-slide**

In `media-src/src/main.css` remove the now-dead panel rules: `.vmarkd-marp__wrapper`, `.vmarkd-marp__editor`, `.vmarkd-marp__splitter`, `.vmarkd-marp__panel`, `.vmarkd-marp__header`, `.vmarkd-marp__toggle`, `.vmarkd-marp__panelbody`, `.vmarkd-marp--collapsed` (×2), `body.vmarkd-marp__resizing`. KEEP `.vmarkd-marp__error`. Retarget the active-slide + deck-section rules to the preview surface:
```css
/* Marp deck inside Vditor's preview surface (task 107). */
.vditor-preview .vditor-reset .marpit section {
  margin: 0 auto 16px;
  max-width: 100%;
  outline: 2px solid transparent;
  transition: outline-color 0.15s;
}
.vditor-preview .vditor-reset .marpit section.vmarkd-marp__active {
  outline-color: var(--vscode-focusBorder, #007fd4);
}
.vmarkd-marp__error {
  color: var(--vscode-errorForeground, #c00);
  padding: 8px;
}
```
(Delete the old `.vmarkd-marp__deck section` rules.)

- [ ] **Step 2: Build + the FULL regression sweep**

Run: `node build.mjs` (clean) then:
```bash
rtk proxy npx vitest run --config test/vitest.config.ts        # all backend pass (incl. marp-detect + marp-slide-map)
cd media-src && rtk proxy npx playwright test marp.spec.ts callouts.spec.ts blockbg.spec.ts split-scroll.spec.ts
```
Expected: marp 5/5, callouts 7/7, blockbg 3/3, split-scroll all pass (the preview patch must not regress sv scroll-sync, which reads `.vditor-preview`). Then `npm run lint:ci` exit 0.

- [ ] **Step 3: Update CHANGELOG + task note**

`CHANGELOG.md` — replace the Phase-1 Marp bullet's panel wording with the preview-surface model (fork-vs-original style, no before/after narrative):
```markdown
- **Marp presentations**: a `marp: true` document renders a live, read-only Marp slide deck in the
  editor's preview — the split-view right pane and the IR/WYSIWYG "Preview" button both show the
  slides instead of the raw HTML render. Per-slide card frames overlay the editor in IR/WYSIWYG;
  the deck highlights and scrolls to the caret's slide, and clicking a slide jumps the source to
  it. The Markdown stays the single source of truth.
```
`tasks/107-marp-slide-preview.md` — update the "Phase 1 — DONE" note: deck renders in Vditor's native preview surface (sv pane + Preview button), not a standalone panel; standalone panel removed.

- [ ] **Step 4: Commit**

```bash
git add media-src/src/main.css CHANGELOG.md tasks/107-marp-slide-preview.md
git commit -m "docs+css(marp): preview-surface model — prune panel CSS, update docs (task 107)"
```

---

## Real-webview verification items (cannot test in the Playwright harness)

After implementation, these need a manual check in the actual VS Code editor (the harness uses a stub `.vditor-preview`, not the real Vditor preview pipeline + Lute):

1. **The Preview button (IR & WYSIWYG)** actually shows the Marp deck (not the HTML render), and toggling it off returns to the editor.
2. **SPLIT (sv) mode right pane** shows the deck and updates as you edit.
3. **First-open async**: the "Loading Marp…" placeholder appears once, then repaints to the deck (chunk load → `preview.render` repaint), and subsequent renders are immediate.
4. **`afterRender` interaction**: Vditor runs `afterRender()` (syntax highlight / math / mermaid) on the preview after innerHTML. Confirm it doesn't mangle Marp's HTML (e.g. code fences inside slides). If it does, the fix is to skip afterRender's processing for marp docs (a follow-up patch).
5. **Round-trip unaffected**: editing still saves correct markdown (the preview is read-only output; the source is untouched) — `---` count preserved.
6. **Reverse-nav** (`__vmarkdMarpNav`) still has no host consumer — clicking a slide computes an offset but doesn't move the caret yet (deferred, as in Phase 1).

## Self-Review

- **Spec coverage:** Preview button (IR/WYSIWYG) + sv pane both render the deck via ONE esbuild seam (R1/R2). ✓ Standalone panel removed (R2 Step 6). ✓ Caret→slide highlight retargeted to preview sections (R2/R3). ✓ Click→offset retargeted (R2). ✓ Overlay (editor cards) kept untouched. ✓ Async first-load handled with placeholder+repaint. ✓ CSS pruned + retargeted (R3). ✓ Regression incl. split-scroll-sync (R3 Step 2). ✓
- **Placeholders:** none — full code in each step.
- **Type consistency:** `renderMarpPreview(source, marp)→string`, `highlightPreviewSlide(source, offset)`, `installMarpPreview()`, `slideIndexForOffset`/`offsetForSlideIndex` (now in `marp-slide-map.ts`), `__vmarkdRenderMarpPreview`/`__vmarkdMarpNav` globals — consistent across patch, intercept, main.ts, harness.
- **esbuild collision** (two patches on `preview/index.ts`) explicitly handled in R1 Step 5 (merge into one onLoad).
