import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

// E2e for the `vmarkd.editor.codeLineNumbers` setting. The setting must GOVERN the
// rendered line-number gutter in code blocks — on AND off. The reported bug: line
// numbers were "always there" and the setting couldn't turn them off, because the
// webview persists the whole Vditor `preview` object (saveVditorOptions) so a saved
// `preview.hljs.lineNumber: true` (from a session where the setting was on) was
// spread back into the init options and the old buildVditorOptions only ever set
// lineNumber:true — never false — so the saved value pinned it on forever.
//
// The harness drives the REAL buildVditorOptions via query params:
//   ?setting=1|0  -> the live codeLineNumbers setting
//   ?saved=1      -> a stale saved preview.hljs.lineNumber:true blob
//   ?mode=ir|wysiwyg  -> editor mode

async function goto(page: Page, query: string) {
  await page.goto(`/code-linenumber.html${query}`)
  await page.waitForFunction(() => (window as any).__ready === true)
  // highlightRender adds `code.hljs` BEFORE the lineNumber branch, so this is a
  // reliable "code highlighting finished" signal in both the on and off cases —
  // letting the off case assert the gutter is genuinely absent (not just unrendered).
  await page.waitForSelector('code.hljs')
}

function gutters(page: Page) {
  return page.locator('.vditor-linenumber__rows')
}

test.describe('codeLineNumbers setting governs the gutter (IR mode)', () => {
  test('setting ON renders a line-number gutter', async ({ page }) => {
    await goto(page, '?mode=ir&setting=1')
    expect(
      await page.evaluate(() => (window as any).__effectiveLineNumber),
    ).toBe(true)
    await expect(gutters(page)).toHaveCount(1)
  })

  test('setting OFF renders NO line-number gutter', async ({ page }) => {
    await goto(page, '?mode=ir&setting=0')
    expect(
      await page.evaluate(() => (window as any).__effectiveLineNumber),
    ).toBe(false)
    await expect(gutters(page)).toHaveCount(0)
  })

  test('setting OFF wins over a stale saved lineNumber:true (the bug)', async ({
    page,
  }) => {
    // A previous session saved preview.hljs.lineNumber:true; the setting is now OFF.
    // The current setting must win — no gutter.
    await goto(page, '?mode=ir&setting=0&saved=1')
    expect(
      await page.evaluate(() => (window as any).__effectiveLineNumber),
    ).toBe(false)
    await expect(gutters(page)).toHaveCount(0)
  })

  test('setting ON still renders the gutter when saved blob agrees', async ({
    page,
  }) => {
    await goto(page, '?mode=ir&setting=1&saved=1')
    expect(
      await page.evaluate(() => (window as any).__effectiveLineNumber),
    ).toBe(true)
    await expect(gutters(page)).toHaveCount(1)
  })
})

test.describe('codeLineNumbers setting governs the gutter (WYSIWYG mode)', () => {
  test('setting ON renders a gutter in wysiwyg', async ({ page }) => {
    await goto(page, '?mode=wysiwyg&setting=1')
    await expect(gutters(page)).toHaveCount(1)
  })

  test('setting OFF + stale saved value still renders no gutter in wysiwyg', async ({
    page,
  }) => {
    await goto(page, '?mode=wysiwyg&setting=0&saved=1')
    await expect(gutters(page)).toHaveCount(0)
  })
})
