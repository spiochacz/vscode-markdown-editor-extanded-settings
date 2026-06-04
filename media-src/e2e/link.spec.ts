import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

/**
 * E2e for IR/WYSIWYG link-click behaviour (task 62), driven by the configurable
 * link-open policy:
 *   - 'modifier' (default): a PLAIN click does NOT follow the link (no `open-link`
 *     → caret stays for editing); a Ctrl/Cmd+click DOES follow it.
 *   - 'click' (legacy): a plain click follows the link.
 * Exactly one `open-link` is posted when following (no double-post across the IR/
 * WYSIWYG patch + fixLinkClick). The harness records posts on window.__posted.
 */
const HREF = 'https://example.com/page'

async function gotoLink(
  page: Page,
  mode: 'ir' | 'wysiwyg',
  policy: 'modifier' | 'click' = 'modifier',
) {
  await page.addInitScript(() => {
    ;(window as any).__posted = []
    ;(window as any).acquireVsCodeApi = () => ({
      postMessage: (m: any) => (window as any).__posted.push(m),
      getState: () => undefined,
      setState: () => {},
    })
  })
  await page.goto(`/link.html?mode=${mode}&policy=${policy}`)
  await page.waitForFunction(() => (window as any).__ready === true)
}

// Dispatch a bubbling click (optionally with Ctrl) on the link node, then return
// the open-link hrefs posted to the host.
async function clickLinkHrefs(page: Page, mode: string, ctrl: boolean) {
  return page.evaluate(
    ({ mode, ctrl }) => {
      ;(window as any).__posted = []
      const node =
        mode === 'ir'
          ? document.querySelector('[data-type="a"]')
          : document.querySelector('a[href]')
      if (!node) return { found: false, hrefs: [] as string[] }
      node.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          ctrlKey: ctrl,
        }),
      )
      const hrefs = (window as any).__posted
        .filter((m: any) => m.command === 'open-link')
        .map((m: any) => m.href)
      return { found: true, hrefs }
    },
    { mode, ctrl },
  )
}

for (const mode of ['ir', 'wysiwyg'] as const) {
  test.describe(`link click — ${mode} mode, default (modifier) policy`, () => {
    test('plain click does NOT follow the link (stays for editing)', async ({
      page,
    }) => {
      await gotoLink(page, mode, 'modifier')
      const res = await clickLinkHrefs(page, mode, false)
      expect(res.found).toBe(true)
      expect(res.hrefs).toEqual([])
    })

    test('Ctrl+click follows the link exactly once (correct URL, no double-post)', async ({
      page,
    }) => {
      await gotoLink(page, mode, 'modifier')
      const res = await clickLinkHrefs(page, mode, true)
      expect(res.found).toBe(true)
      expect(res.hrefs).toEqual([HREF])
    })
  })

  test.describe(`link click — ${mode} mode, 'click' policy (legacy)`, () => {
    test('plain click follows the link exactly once', async ({ page }) => {
      await gotoLink(page, mode, 'click')
      const res = await clickLinkHrefs(page, mode, false)
      expect(res.found).toBe(true)
      expect(res.hrefs).toEqual([HREF])
    })
  })
}
